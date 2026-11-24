use std::path::{Path, PathBuf};

use shep_domain::{TaskBranch, Worktree};

#[derive(Debug, Clone, PartialEq, Eq, thiserror::Error)]
#[error("git: {0}")]
pub struct GitError(pub String);

/// What a repository looks like from its checkout.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RepoInfo {
    /// `owner/name` from the `origin` remote, when it is on GitHub.
    pub slug: Option<String>,
    /// No uncommitted changes in the person's checkout.
    pub clean: bool,
}

/// What bringing the moved base branch into the task branch did.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum BaseUpdate {
    /// The task branch already has everything on `origin/<base>`.
    UpToDate,
    /// `origin/<base>` was merged in cleanly.
    Merged,
    /// Both sides changed these files. Nothing was merged; the worktree is as it was.
    Conflict(Vec<String>),
}

/// The repository on disk. Work happens only in worktrees made from `origin`; the person's own
/// checkout is never touched.
pub trait Git: Send + Sync {
    /// The top of the repository containing `dir`.
    fn repo_root(&self, dir: &Path) -> Result<PathBuf, GitError>;
    /// Its GitHub name and whether the checkout is clean. Reads only; changes nothing.
    fn describe(&self, repo: &Path) -> Result<RepoInfo, GitError>;
    /// Fetches the default branch from `origin` and makes (or finds again) the task's worktree
    /// on `branch`, starting from `origin/<default>`.
    fn prepare_worktree(&self, repo: &Path, branch: &TaskBranch) -> Result<Worktree, GitError>;
    /// Commits everything the agent left uncommitted. `false` when there was nothing. A merge
    /// the agent left unresolved is abandoned, never committed.
    fn commit_all(&self, worktree: &Worktree, message: &str) -> Result<bool, GitError>;
    /// Commits on the task branch that `origin/<base>` does not have.
    fn commits_ahead(&self, worktree: &Worktree) -> Result<u32, GitError>;
    /// The change against the base, as a patch.
    fn diff(&self, worktree: &Worktree) -> Result<String, GitError>;
    /// One line per changed file, with counts.
    fn diff_stat(&self, worktree: &Worktree) -> Result<String, GitError>;
    /// Pushes the task branch. Implementations must refuse anything
    /// [`shep_domain::check_push`] refuses.
    fn push(&self, worktree: &Worktree) -> Result<(), GitError>;
    /// Commits `files` alone on `branch` (no parent, nothing else) and pushes it; returns the
    /// commit id. Used for screenshots, so they never enter the task's diff.
    fn publish_files(
        &self,
        worktree: &Worktree,
        branch: &str,
        files: &[PathBuf],
    ) -> Result<String, GitError>;
    /// Environment for anything Shep runs in the worktree (agents, the screenshot command):
    /// its own `git push` reaches the task branch only, and the repository's hooks still run.
    fn agent_env(&self, worktree: &Worktree) -> Result<Vec<(String, String)>, GitError>;
    /// Fetches `origin/<base>` and merges it into the task branch, unless that conflicts.
    fn update_from_base(&self, worktree: &Worktree) -> Result<BaseUpdate, GitError>;
    /// Removes the task's worktree folder and what Shep kept beside it. The branch stays.
    fn remove_worktree(&self, repo: &Path, worktree: &Worktree) -> Result<(), GitError>;
    /// Deletes the local task branch.
    fn delete_branch(&self, repo: &Path, branch: &TaskBranch) -> Result<(), GitError>;
}
