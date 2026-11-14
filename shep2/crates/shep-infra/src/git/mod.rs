//! Git through the `git` command. Work happens in worktrees made from `origin`; the person's
//! checkout, its branch, index and files are never touched.

mod guard;

use std::path::{Path, PathBuf};

use shep_app::ports::{BaseUpdate, Git, GitError, RepoInfo};
use shep_domain::{check_push, TaskBranch, Worktree};

use crate::process::run;

const GIT: &str = "git";
const REMOTE: &str = "origin";
/// Git never stops to ask for a password; a missing credential is an error instead.
const NO_PROMPT: (&str, &str) = ("GIT_TERMINAL_PROMPT", "0");
const PROOF_MESSAGE: &str = "Proof screenshots from Shep";
/// Present while a merge waits to be concluded.
const MERGE_HEAD: &str = "MERGE_HEAD";

pub struct GitCli {
    worktrees: PathBuf,
}

impl GitCli {
    /// Worktrees are made under `worktrees`, one folder per repository and branch.
    pub fn new(worktrees: impl Into<PathBuf>) -> Self {
        Self {
            worktrees: worktrees.into(),
        }
    }

    fn worktree_path(&self, repo: &Path, branch: &TaskBranch) -> PathBuf {
        let repo_name = repo
            .file_name()
            .map_or_else(|| "repo".into(), |n| n.to_string_lossy().into_owned());
        self.worktrees
            .join(repo_name)
            .join(branch.as_str().replace('/', "-"))
    }
}

fn git(dir: &Path, args: &[&str]) -> Result<String, GitError> {
    git_with(dir, args, &[])
}

fn git_with(dir: &Path, args: &[&str], env: &[(&str, &str)]) -> Result<String, GitError> {
    let mut all = vec![NO_PROMPT];
    all.extend_from_slice(env);
    run(GIT, args, Some(dir), &all).map_err(GitError)
}

/// The branch `origin/HEAD` points at, as the remote says.
fn default_branch(repo: &Path) -> Result<String, GitError> {
    const REF_PREFIX: &str = "ref: refs/heads/";
    let listing = git(repo, &["ls-remote", "--symref", REMOTE, "HEAD"])?;
    listing
        .lines()
        .find_map(|l| l.strip_prefix(REF_PREFIX))
        .and_then(|rest| rest.split_whitespace().next())
        .map(str::to_owned)
        .ok_or_else(|| GitError(format!("{REMOTE} has no default branch")))
}

fn base_ref(wt: &Worktree) -> String {
    format!("{REMOTE}/{}", wt.base)
}

fn refused(e: impl std::fmt::Display) -> GitError {
    GitError(e.to_string())
}

const GITHUB_PREFIXES: [&str; 3] = [
    "https://github.com/",
    "git@github.com:",
    "ssh://git@github.com/",
];
const GIT_SUFFIX: &str = ".git";

/// `owner/name` from a GitHub remote URL.
pub fn github_slug(url: &str) -> Option<String> {
    let rest = GITHUB_PREFIXES
        .iter()
        .find_map(|p| url.trim().strip_prefix(p))?;
    let rest = rest.trim_end_matches('/');
    let slug = rest.strip_suffix(GIT_SUFFIX).unwrap_or(rest);
    let (owner, name) = slug.split_once('/')?;
    (!owner.is_empty() && !name.is_empty() && !name.contains('/')).then(|| slug.to_owned())
}

impl Git for GitCli {
    fn describe(&self, repo: &Path) -> Result<RepoInfo, GitError> {
        let url = git(repo, &["remote", "get-url", REMOTE]).unwrap_or_default();
        let status = git(repo, &["status", "--porcelain"])?;
        Ok(RepoInfo {
            slug: github_slug(&url),
            clean: status.is_empty(),
        })
    }

    fn repo_root(&self, dir: &Path) -> Result<PathBuf, GitError> {
        git(dir, &["rev-parse", "--show-toplevel"]).map(PathBuf::from)
    }

    fn prepare_worktree(&self, repo: &Path, branch: &TaskBranch) -> Result<Worktree, GitError> {
        let base = default_branch(repo)?;
        let path = self.worktree_path(repo, branch);
        let worktree = Worktree {
            path: path.display().to_string(),
            branch: branch.clone(),
            base: base.clone(),
        };
        if path.join(".git").exists() {
            return Ok(worktree);
        }
        git(repo, &["fetch", "--quiet", REMOTE, &base])?;
        git(repo, &["worktree", "prune"])?;
        let path_arg = worktree.path.as_str();
        let local = format!("refs/heads/{branch}");
        if git(repo, &["rev-parse", "--verify", "--quiet", &local]).is_ok() {
            git(
                repo,
                &["worktree", "add", "--quiet", path_arg, branch.as_str()],
            )?;
        } else {
            let start = format!("{REMOTE}/{base}");
            git(
                repo,
                &[
                    "worktree",
                    "add",
                    "--quiet",
                    "--no-track",
                    "-b",
                    branch.as_str(),
                    path_arg,
                    &start,
                ],
            )?;
        }
        Ok(worktree)
    }

    fn commit_all(&self, wt: &Worktree, message: &str) -> Result<bool, GitError> {
        let dir = Path::new(&wt.path);
        if !git(dir, &["ls-files", "--unmerged"])?.is_empty() {
            // Conflicts the agent left: adding them would commit the markers.
            git(dir, &["reset", "--quiet", "--merge"])?;
            return Ok(false);
        }
        git(dir, &["add", "--all"])?;
        if git(dir, &["diff", "--cached", "--quiet"]).is_ok() {
            return Ok(false);
        }
        // CI is the gate; a hook that needs tools the worktree lacks must not block the commit.
        git(dir, &["commit", "--quiet", "--no-verify", "-m", message])?;
        Ok(true)
    }

    fn commits_ahead(&self, wt: &Worktree) -> Result<u32, GitError> {
        let range = format!("{}..HEAD", base_ref(wt));
        let count = git(Path::new(&wt.path), &["rev-list", "--count", &range])?;
        count
            .parse()
            .map_err(|_| GitError(format!("unexpected commit count {count:?}")))
    }

    fn diff(&self, wt: &Worktree) -> Result<String, GitError> {
        let range = format!("{}...HEAD", base_ref(wt));
        git(Path::new(&wt.path), &["diff", &range])
    }

    fn diff_stat(&self, wt: &Worktree) -> Result<String, GitError> {
        let range = format!("{}...HEAD", base_ref(wt));
        git(Path::new(&wt.path), &["diff", "--stat", &range])
    }

    fn push(&self, wt: &Worktree) -> Result<(), GitError> {
        check_push(wt.branch.as_str(), &wt.base).map_err(refused)?;
        let refspec = format!("HEAD:refs/heads/{}", wt.branch);
        let dir = Path::new(&wt.path);
        git(
            dir,
            &["push", "--quiet", "--force-with-lease", REMOTE, &refspec],
        )
        .map(|_| ())
    }

    fn publish_files(
        &self,
        wt: &Worktree,
        branch: &str,
        files: &[PathBuf],
    ) -> Result<String, GitError> {
        check_push(branch, &wt.base).map_err(refused)?;
        let dir = Path::new(&wt.path);
        let index = tempfile_path(dir)?;
        let index_env = index.display().to_string();
        let env = [("GIT_INDEX_FILE", index_env.as_str())];
        for file in files {
            let name = file
                .file_name()
                .map(|n| n.to_string_lossy().into_owned())
                .ok_or_else(|| GitError(format!("{} has no file name", file.display())))?;
            let path = file.display().to_string();
            let blob = git(dir, &["hash-object", "-w", &path])?;
            let info = format!("100644,{blob},{name}");
            git_with(dir, &["update-index", "--add", "--cacheinfo", &info], &env)?;
        }
        let tree = git_with(dir, &["write-tree"], &env)?;
        let _ = std::fs::remove_file(&index);
        let commit = git(dir, &["commit-tree", &tree, "-m", PROOF_MESSAGE])?;
        let refspec = format!("{commit}:refs/heads/{branch}");
        git(dir, &["push", "--quiet", "--force", REMOTE, &refspec])?;
        Ok(commit)
    }

    fn agent_env(&self, wt: &Worktree) -> Result<Vec<(String, String)>, GitError> {
        guard::install(wt).map(|dir| guard::env(&dir))
    }

    /// A conflicting merge is abandoned at once, so the worktree is never left half-merged.
    fn update_from_base(&self, wt: &Worktree) -> Result<BaseUpdate, GitError> {
        let dir = Path::new(&wt.path);
        git(dir, &["fetch", "--quiet", REMOTE, &wt.base])?;
        if git(dir, &["rev-parse", "--quiet", "--verify", MERGE_HEAD]).is_ok() {
            git(dir, &["merge", "--abort"])?;
        }
        let base = base_ref(wt);
        if git(dir, &["merge-base", "--is-ancestor", &base, "HEAD"]).is_ok() {
            return Ok(BaseUpdate::UpToDate);
        }
        // As with Shep's own commits, CI is the gate, not the repository's commit hooks.
        let merged = git(
            dir,
            &["merge", "--quiet", "--no-edit", "--no-verify", &base],
        );
        let Err(why) = merged else {
            return Ok(BaseUpdate::Merged);
        };
        let conflicted = git(dir, &["diff", "--name-only", "--diff-filter=U"])?;
        if git(dir, &["rev-parse", "--quiet", "--verify", MERGE_HEAD]).is_ok() {
            git(dir, &["merge", "--abort"])?;
        }
        let files: Vec<String> = conflicted.lines().map(str::to_owned).collect();
        if files.is_empty() {
            return Err(why);
        }
        Ok(BaseUpdate::Conflict(files))
    }

    fn remove_worktree(&self, repo: &Path, wt: &Worktree) -> Result<(), GitError> {
        if Path::new(&wt.path).exists() {
            git(repo, &["worktree", "remove", "--force", &wt.path])?;
        }
        git(repo, &["worktree", "prune"])?;
        guard::remove(wt)
    }

    fn delete_branch(&self, repo: &Path, branch: &TaskBranch) -> Result<(), GitError> {
        let local = format!("refs/heads/{branch}");
        if git(repo, &["rev-parse", "--quiet", "--verify", &local]).is_err() {
            return Ok(());
        }
        // `-D`: a squash-merged branch is not merged as far as git can tell.
        git(repo, &["branch", "--quiet", "-D", branch.as_str()]).map(|_| ())
    }
}

/// A fresh index file inside the repository's git dir, for building a commit apart from the
/// worktree's own index.
fn tempfile_path(dir: &Path) -> Result<PathBuf, GitError> {
    let git_dir = git(dir, &["rev-parse", "--absolute-git-dir"])?;
    let path = Path::new(&git_dir).join("shep-proof-index");
    let _ = std::fs::remove_file(&path);
    Ok(path)
}
