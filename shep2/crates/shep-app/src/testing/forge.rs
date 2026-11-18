use std::collections::{HashMap, HashSet, VecDeque};
use std::path::Path;
use std::sync::Mutex;

use shep_domain::{CiCheck, PullRequest, TaskSourceRef, UnixTime, Worktree};

use super::lock;
use crate::ports::{Forge, ForgeError, Issue, IssueRef, IssueState, PrComment};

/// The login the fake forge is signed in as, until a test signs it out or in as someone else.
pub const FAKE_VIEWER: &str = "night-owl";

struct ForgeState {
    issues: HashMap<u64, Issue>,
    closed_issues: HashSet<u64>,
    opened: Vec<(String, String)>,
    bodies: Vec<String>,
    checks: VecDeque<Vec<CiCheck>>,
    merged: Vec<PullRequest>,
    fail_merge: Option<String>,
    labels: HashMap<String, Vec<u64>>,
    comments: HashMap<u64, Vec<PrComment>>,
    closed_prs: Vec<(PullRequest, String)>,
    issue_polls: u32,
    comment_polls: u32,
    /// `None`: `gh` is signed out.
    signed_in: Option<String>,
}

impl Default for ForgeState {
    fn default() -> Self {
        Self {
            issues: HashMap::new(),
            closed_issues: HashSet::new(),
            opened: Vec::new(),
            bodies: Vec::new(),
            checks: VecDeque::new(),
            merged: Vec::new(),
            fail_merge: None,
            labels: HashMap::new(),
            comments: HashMap::new(),
            closed_prs: Vec::new(),
            issue_polls: 0,
            comment_polls: 0,
            signed_in: Some(FAKE_VIEWER.into()),
        }
    }
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
    /// Who `gh` is signed in as (`None`: signed out).
    pub fn sign_in(&self, login: Option<&str>) {
        lock(&self.0).signed_in = login.map(str::to_owned);
    }
    /// Puts `label` on these issues.
    pub fn label(&self, numbers: &[u64], label: &str) {
        lock(&self.0)
            .labels
            .entry(label.to_owned())
            .or_default()
            .extend_from_slice(numbers);
    }
    pub fn fail_merges(&self, why: Option<&str>) {
        lock(&self.0).fail_merge = why.map(str::to_owned);
    }
    /// Someone closed the issue.
    pub fn close_issue(&self, number: u64) {
        lock(&self.0).closed_issues.insert(number);
    }
    /// `author` comments on pull request `pr` at `at`.
    pub fn comment(&self, pr: u64, author: &str, body: &str, at: i64) {
        lock(&self.0)
            .comments
            .entry(pr)
            .or_default()
            .push(PrComment {
                author: author.into(),
                body: body.into(),
                at: UnixTime(at),
            });
    }
    /// Pull requests closed, with the comment left on each.
    pub fn closed(&self) -> Vec<(PullRequest, String)> {
        lock(&self.0).closed_prs.clone()
    }
    /// How many times an issue's state was asked for.
    pub fn issue_polls(&self) -> u32 {
        lock(&self.0).issue_polls
    }
    /// How many times a pull request's comments were read.
    pub fn comment_polls(&self) -> u32 {
        lock(&self.0).comment_polls
    }
}

impl Forge for FakeForge {
    fn whoami(&self) -> Result<Option<String>, ForgeError> {
        Ok(lock(&self.0).signed_in.clone())
    }
    fn open_issues(&self, _repo: &Path, limit: usize) -> Result<Vec<IssueRef>, ForgeError> {
        let s = lock(&self.0);
        let mut issues: Vec<IssueRef> = s
            .issues
            .iter()
            .filter(|(n, _)| !s.closed_issues.contains(n))
            .map(|(n, i)| IssueRef {
                number: *n,
                title: i.title.clone(),
            })
            .collect();
        issues.sort_by_key(|i| i.number);
        issues.truncate(limit);
        Ok(issues)
    }
    fn labelled(&self, _repo: &Path, label: &str) -> Result<Vec<IssueRef>, ForgeError> {
        let s = lock(&self.0);
        let numbers = s.labels.get(label).cloned().unwrap_or_default();
        Ok(numbers
            .into_iter()
            .filter_map(|n| {
                s.issues.get(&n).map(|i| IssueRef {
                    number: n,
                    title: i.title.clone(),
                })
            })
            .collect())
    }
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
    fn comments(&self, _repo: &Path, pr: &PullRequest) -> Result<Vec<PrComment>, ForgeError> {
        let mut s = lock(&self.0);
        s.comment_polls += 1;
        Ok(s.comments.get(&pr.number).cloned().unwrap_or_default())
    }
    fn issue_state(
        &self,
        _repo: &Path,
        source: &TaskSourceRef,
    ) -> Result<Option<IssueState>, ForgeError> {
        let TaskSourceRef::GitHubIssue { number, .. } = source else {
            return Ok(None);
        };
        let mut s = lock(&self.0);
        s.issue_polls += 1;
        if !s.issues.contains_key(number) {
            return Err(ForgeError(format!("no issue #{number}")));
        }
        Ok(Some(if s.closed_issues.contains(number) {
            IssueState::Closed
        } else {
            IssueState::Open
        }))
    }
    fn close(&self, _repo: &Path, pr: &PullRequest, comment: &str) -> Result<(), ForgeError> {
        lock(&self.0)
            .closed_prs
            .push((pr.clone(), comment.to_owned()));
        Ok(())
    }
}
