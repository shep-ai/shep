//! Making a task's worktree from `origin`, on a branch name nobody else is using. Shep marks
//! the branches it makes with the Shep home that made them, so a home finds its own again and
//! never builds on a branch left by an earlier install or an old pull request.

use std::path::Path;

use shep_app::ports::GitError;
use shep_domain::{TaskBranch, Worktree};

use super::{default_branch, git, GitCli, REMOTE};

/// `git config branch.<name>.shep-home <worktrees folder>` says which Shep home made a branch.
const OWNER_KEY: &str = "shep-home";
/// Numbered names tried (`-2` up to this) before giving up.
const LAST_NUMBER: u32 = 50;

impl GitCli {
    pub(super) fn prepare(&self, repo: &Path, wanted: &TaskBranch) -> Result<Worktree, GitError> {
        let base = default_branch(repo)?;
        let at = |branch: TaskBranch| Worktree {
            path: self.worktree_path(repo, &branch).display().to_string(),
            branch,
            base: base.clone(),
        };
        // Made before by this home: found again without asking origin.
        if let Some(found) =
            names(wanted).find(|b| self.worktree_path(repo, b).join(".git").exists())
        {
            return Ok(at(found));
        }
        git(repo, &["fetch", "--quiet", REMOTE, &base])?;
        git(repo, &["worktree", "prune"])?;
        for branch in names(wanted) {
            let worktree = at(branch.clone());
            let path = worktree.path.as_str();
            if self.owns(repo, &branch) && has_local(repo, &branch) {
                git(repo, &["worktree", "add", "--quiet", path, branch.as_str()])?;
                return Ok(worktree);
            }
            if has_local(repo, &branch) || on_origin(repo, &branch) {
                continue;
            }
            let start = format!("{REMOTE}/{base}");
            let name = branch.as_str();
            git(
                repo,
                &[
                    "worktree",
                    "add",
                    "--quiet",
                    "--no-track",
                    "-b",
                    name,
                    path,
                    &start,
                ],
            )?;
            git(repo, &["config", &owner_key(&branch), &self.home_mark()])?;
            return Ok(worktree);
        }
        Err(GitError(format!(
            "every branch name for {wanted} up to -{LAST_NUMBER} is taken"
        )))
    }

    /// Whether this Shep home made the branch.
    fn owns(&self, repo: &Path, branch: &TaskBranch) -> bool {
        git(repo, &["config", "--get", &owner_key(branch)])
            .is_ok_and(|owner| owner == self.home_mark())
    }

    fn home_mark(&self) -> String {
        self.worktrees.display().to_string()
    }
}

/// The wanted name, then `-2`, `-3`, ….
fn names(wanted: &TaskBranch) -> impl Iterator<Item = TaskBranch> + '_ {
    std::iter::once(wanted.clone()).chain((2..=LAST_NUMBER).map(|n| wanted.numbered(n)))
}

fn owner_key(branch: &TaskBranch) -> String {
    format!("branch.{branch}.{OWNER_KEY}")
}

fn has_local(repo: &Path, branch: &TaskBranch) -> bool {
    let local = format!("refs/heads/{branch}");
    git(repo, &["rev-parse", "--verify", "--quiet", &local]).is_ok()
}

/// A branch of that name on origin, like one an earlier pull request left.
fn on_origin(repo: &Path, branch: &TaskBranch) -> bool {
    git(repo, &["ls-remote", "--heads", REMOTE, branch.as_str()]).is_ok_and(|out| !out.is_empty())
}
