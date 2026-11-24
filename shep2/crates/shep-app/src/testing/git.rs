use std::collections::{HashMap, VecDeque};
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use shep_domain::{check_push, TaskBranch, Worktree};

use super::lock;
use crate::ports::{BaseUpdate, Git, GitError, RepoInfo};

/// The default branch every fake repository has.
pub const FAKE_BASE: &str = "main";
/// Where the fake keeps each task branch's guard hooks: `/hooks/<branch>`.
pub const FAKE_HOOKS: &str = "/hooks";

#[derive(Default)]
struct GitState {
    repos: Vec<PathBuf>,
    worktrees: Vec<Worktree>,
    /// Whether the agent left uncommitted changes in a worktree (by path).
    dirty: HashMap<String, bool>,
    ahead: HashMap<String, u32>,
    commits: Vec<String>,
    pushes: Vec<String>,
    published: Vec<(String, Vec<PathBuf>)>,
    fail_push: Option<String>,
    base_updates: VecDeque<BaseUpdate>,
    base_checks: u32,
    diff: Option<String>,
    removed: Vec<String>,
    deleted: Vec<String>,
}

/// A repository in memory. A test marks a worktree dirty to say "the agent changed files".
#[derive(Default)]
pub struct FakeGit(Mutex<GitState>);

impl FakeGit {
    pub fn add_repo(&self, path: impl Into<PathBuf>) {
        lock(&self.0).repos.push(path.into());
    }
    pub fn worktrees(&self) -> Vec<Worktree> {
        lock(&self.0).worktrees.clone()
    }
    /// The agent changed files in this worktree without committing.
    pub fn touch(&self, worktree: &Worktree) {
        lock(&self.0).dirty.insert(worktree.path.clone(), true);
    }
    /// Commit messages Shep made.
    pub fn commits(&self) -> Vec<String> {
        lock(&self.0).commits.clone()
    }
    /// Branches pushed, in order.
    pub fn pushes(&self) -> Vec<String> {
        lock(&self.0).pushes.clone()
    }
    pub fn published(&self) -> Vec<(String, Vec<PathBuf>)> {
        lock(&self.0).published.clone()
    }
    pub fn fail_pushes(&self, why: Option<&str>) {
        lock(&self.0).fail_push = why.map(str::to_owned);
    }
    /// What the next updates from the base branch find, in order; then it is up to date.
    pub fn queue_base_update(&self, update: BaseUpdate) {
        lock(&self.0).base_updates.push_back(update);
    }
    /// How many times Shep brought the base branch in.
    pub fn base_checks(&self) -> u32 {
        lock(&self.0).base_checks
    }
    /// Replaces the patch every worktree shows.
    pub fn set_diff(&self, patch: &str) {
        lock(&self.0).diff = Some(patch.to_owned());
    }
    /// Worktree paths removed.
    pub fn removed(&self) -> Vec<String> {
        lock(&self.0).removed.clone()
    }
    /// Local branches deleted.
    pub fn deleted(&self) -> Vec<String> {
        lock(&self.0).deleted.clone()
    }
}

/// Every fake repository is `acme/app` on GitHub.
pub const FAKE_SLUG: &str = "acme/app";

impl Git for FakeGit {
    fn describe(&self, _repo: &Path) -> Result<RepoInfo, GitError> {
        Ok(RepoInfo {
            slug: Some(FAKE_SLUG.into()),
            clean: true,
        })
    }
    fn repo_root(&self, dir: &Path) -> Result<PathBuf, GitError> {
        lock(&self.0)
            .repos
            .iter()
            .find(|r| dir.starts_with(r))
            .cloned()
            .ok_or_else(|| GitError(format!("{} is not in a git repository", dir.display())))
    }
    fn prepare_worktree(&self, _repo: &Path, branch: &TaskBranch) -> Result<Worktree, GitError> {
        let wt = Worktree {
            path: format!("/wt/{branch}"),
            branch: branch.clone(),
            base: FAKE_BASE.into(),
        };
        let mut s = lock(&self.0);
        if !s.worktrees.contains(&wt) {
            s.worktrees.push(wt.clone());
        }
        Ok(wt)
    }
    fn commit_all(&self, worktree: &Worktree, message: &str) -> Result<bool, GitError> {
        let mut s = lock(&self.0);
        if s.dirty.insert(worktree.path.clone(), false) != Some(true) {
            return Ok(false);
        }
        *s.ahead.entry(worktree.path.clone()).or_default() += 1;
        s.commits.push(message.to_owned());
        Ok(true)
    }
    fn commits_ahead(&self, worktree: &Worktree) -> Result<u32, GitError> {
        Ok(lock(&self.0)
            .ahead
            .get(&worktree.path)
            .copied()
            .unwrap_or(0))
    }
    fn diff(&self, worktree: &Worktree) -> Result<String, GitError> {
        let s = lock(&self.0);
        Ok(s.diff
            .clone()
            .unwrap_or_else(|| format!("diff of {}", worktree.branch)))
    }
    fn diff_stat(&self, _worktree: &Worktree) -> Result<String, GitError> {
        Ok(" src/app.rs | 2 +-".into())
    }
    fn push(&self, worktree: &Worktree) -> Result<(), GitError> {
        check_push(worktree.branch.as_str(), &worktree.base)
            .map_err(|e| GitError(e.to_string()))?;
        let mut s = lock(&self.0);
        if let Some(why) = &s.fail_push {
            return Err(GitError(why.clone()));
        }
        s.pushes.push(worktree.branch.to_string());
        Ok(())
    }
    fn publish_files(
        &self,
        worktree: &Worktree,
        branch: &str,
        files: &[PathBuf],
    ) -> Result<String, GitError> {
        check_push(branch, &worktree.base).map_err(|e| GitError(e.to_string()))?;
        lock(&self.0)
            .published
            .push((branch.to_owned(), files.to_vec()));
        Ok("abc123".into())
    }
    fn agent_env(&self, worktree: &Worktree) -> Result<Vec<(String, String)>, GitError> {
        Ok(vec![
            ("GIT_CONFIG_COUNT".into(), "1".into()),
            ("GIT_CONFIG_KEY_0".into(), "core.hooksPath".into()),
            (
                "GIT_CONFIG_VALUE_0".into(),
                format!("{FAKE_HOOKS}/{}", worktree.branch),
            ),
        ])
    }
    fn update_from_base(&self, _worktree: &Worktree) -> Result<BaseUpdate, GitError> {
        let mut s = lock(&self.0);
        s.base_checks += 1;
        Ok(s.base_updates.pop_front().unwrap_or(BaseUpdate::UpToDate))
    }
    fn remove_worktree(&self, _repo: &Path, worktree: &Worktree) -> Result<(), GitError> {
        let mut s = lock(&self.0);
        s.worktrees.retain(|w| w.path != worktree.path);
        s.removed.push(worktree.path.clone());
        Ok(())
    }
    fn delete_branch(&self, _repo: &Path, branch: &TaskBranch) -> Result<(), GitError> {
        lock(&self.0).deleted.push(branch.to_string());
        Ok(())
    }
}
