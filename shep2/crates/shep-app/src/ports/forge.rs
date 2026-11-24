use std::path::Path;

use shep_domain::{CiCheck, PullRequest, TaskSourceRef, UnixTime, Worktree};

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

/// An open issue as a list shows it.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct IssueRef {
    pub number: u64,
    pub title: String,
}

/// Whether an issue is still wanted.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum IssueState {
    Open,
    Closed,
}

/// A comment in a pull request's conversation.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PrComment {
    /// The GitHub login of whoever wrote it.
    pub author: String,
    pub body: String,
    pub at: UnixTime,
}

/// Where pull requests and CI live (GitHub, through `gh`).
pub trait Forge: Send + Sync {
    /// Who `gh` is signed in as, or `None` when it is not signed in (or not installed).
    fn whoami(&self) -> Result<Option<String>, ForgeError>;
    /// The newest open issues, up to `limit`.
    fn open_issues(&self, repo: &Path, limit: usize) -> Result<Vec<IssueRef>, ForgeError>;
    /// Open issues in the repository that carry `label`.
    fn labelled(&self, repo: &Path, label: &str) -> Result<Vec<IssueRef>, ForgeError>;
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
    /// The comments in the pull request's conversation, oldest first.
    fn comments(&self, repo: &Path, pr: &PullRequest) -> Result<Vec<PrComment>, ForgeError>;
    /// Whether the issue behind a task is still open, or `None` for a source this forge does
    /// not hold (a sentence).
    fn issue_state(
        &self,
        repo: &Path,
        source: &TaskSourceRef,
    ) -> Result<Option<IssueState>, ForgeError>;
    /// Closes the pull request (unmerged) with a comment saying why.
    fn close(&self, repo: &Path, pr: &PullRequest, comment: &str) -> Result<(), ForgeError>;
}
