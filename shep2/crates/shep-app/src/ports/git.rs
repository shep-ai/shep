use std::path::{Path, PathBuf};

use shep_domain::{TaskBranch, Worktree};

#[derive(Debug, Clone, PartialEq, Eq, thiserror::Error)]
#[error("git: {0}")]
pub struct GitError(pub String);

/// The repository on disk. Work happens only in worktrees made from `origin`; the person's own
/// checkout is never touched.
pub trait Git: Send + Sync {
    /// The top of the repository containing `dir`.
    fn repo_root(&self, dir: &Path) -> Result<PathBuf, GitError>;
    /// Fetches the default branch from `origin` and makes (or finds again) the task's worktree
    /// on `branch`, starting from `origin/<default>`.
    fn prepare_worktree(&self, repo: &Path, branch: &TaskBranch) -> Result<Worktree, GitError>;
    /// Commits everything the agent left uncommitted. `false` when there was nothing.
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
}
