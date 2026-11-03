use std::collections::{HashMap, VecDeque};
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use shep_domain::{check_push, CiCheck, PullRequest, TaskBranch, TaskSourceRef, Worktree};

use super::lock;
use crate::ports::{Forge, ForgeError, Git, GitError, Issue};

/// The default branch every fake repository has.
pub const FAKE_BASE: &str = "main";

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
}

impl Git for FakeGit {
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
        Ok(format!("diff of {}", worktree.branch))
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
}

#[derive(Default)]
struct ForgeState {
    issues: HashMap<u64, Issue>,
    opened: Vec<(String, String)>,
    bodies: Vec<String>,
    checks: VecDeque<Vec<CiCheck>>,
    merged: Vec<PullRequest>,
    fail_merge: Option<String>,
}

/// GitHub in memory. Checks are answered from a queue a test fills; the last answer repeats.
#[derive(Default)]
pub struct FakeForge(Mutex<ForgeState>);

impl FakeForge {
    pub fn add_issue(&self, number: u64, title: &str, body: &str) {
        lock(&self.0).issues.insert(
            number,
            Issue {
                title: title.into(),
                body: body.into(),
                url: format!("https://github.com/acme/app/issues/{number}"),
            },
        );
    }
    /// Titles and first bodies of the drafts opened.
    pub fn opened(&self) -> Vec<(String, String)> {
        lock(&self.0).opened.clone()
    }
    /// Every body update, in order.
    pub fn bodies(&self) -> Vec<String> {
        lock(&self.0).bodies.clone()
    }
    pub fn queue_checks(&self, checks: Vec<CiCheck>) {
        lock(&self.0).checks.push_back(checks);
    }
    pub fn merged(&self) -> Vec<PullRequest> {
        lock(&self.0).merged.clone()
    }
    pub fn fail_merges(&self, why: Option<&str>) {
        lock(&self.0).fail_merge = why.map(str::to_owned);
    }
}

impl Forge for FakeForge {
    fn issue(&self, _repo: &Path, source: &TaskSourceRef) -> Result<Option<Issue>, ForgeError> {
        match source {
            TaskSourceRef::GitHubIssue { number, .. } => lock(&self.0)
                .issues
                .get(number)
                .cloned()
                .map(Some)
                .ok_or_else(|| ForgeError(format!("no issue #{number}"))),
            _ => Ok(None),
        }
    }
    fn open_draft(
        &self,
        _wt: &Worktree,
        title: &str,
        body: &str,
    ) -> Result<PullRequest, ForgeError> {
        let mut s = lock(&self.0);
        s.opened.push((title.to_owned(), body.to_owned()));
        let number = 100 + s.opened.len() as u64;
        Ok(PullRequest {
            number,
            url: format!("https://github.com/acme/app/pull/{number}"),
        })
    }
    fn update_body(&self, _wt: &Worktree, _pr: &PullRequest, body: &str) -> Result<(), ForgeError> {
        lock(&self.0).bodies.push(body.to_owned());
        Ok(())
    }
    fn checks(&self, _wt: &Worktree, _pr: &PullRequest) -> Result<Vec<CiCheck>, ForgeError> {
        let mut s = lock(&self.0);
        if s.checks.len() > 1 {
            return Ok(s.checks.pop_front().unwrap_or_default());
        }
        Ok(s.checks.front().cloned().unwrap_or_default())
    }
    fn failed_log(&self, _wt: &Worktree, check: &CiCheck) -> Result<String, ForgeError> {
        Ok(format!("log of {}", check.name))
    }
    fn merge(&self, _repo: &Path, pr: &PullRequest) -> Result<(), ForgeError> {
        let mut s = lock(&self.0);
        if let Some(why) = &s.fail_merge {
            return Err(ForgeError(why.clone()));
        }
        s.merged.push(pr.clone());
        Ok(())
    }
}
