use std::path::Path;

use shep_domain::{CiCheck, PullRequest, TaskSourceRef, Worktree};

#[derive(Debug, Clone, PartialEq, Eq, thiserror::Error)]
#[error("GitHub: {0}")]
pub struct ForgeError(pub String);

/// An issue as its tracker shows it.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Issue {
    pub title: String,
    pub body: String,
    pub url: String,
}

/// Where pull requests and CI live (GitHub, through `gh`).
pub trait Forge: Send + Sync {
    /// The issue behind a task, or `None` for a source this forge does not hold (a sentence).
    fn issue(&self, repo: &Path, source: &TaskSourceRef) -> Result<Option<Issue>, ForgeError>;
    /// Opens a **draft** pull request from the worktree's branch into its base.
    fn open_draft(
        &self,
        worktree: &Worktree,
        title: &str,
        body: &str,
    ) -> Result<PullRequest, ForgeError>;
    fn update_body(
        &self,
        worktree: &Worktree,
        pr: &PullRequest,
        body: &str,
    ) -> Result<(), ForgeError>;
    /// The CI checks on the pull request's latest commit.
    fn checks(&self, worktree: &Worktree, pr: &PullRequest) -> Result<Vec<CiCheck>, ForgeError>;
    /// The end of a failed check's log.
    fn failed_log(&self, worktree: &Worktree, check: &CiCheck) -> Result<String, ForgeError>;
    /// Marks the draft ready and merges it. Only ever called on a person's Merge.
    fn merge(&self, repo: &Path, pr: &PullRequest) -> Result<(), ForgeError>;
}
