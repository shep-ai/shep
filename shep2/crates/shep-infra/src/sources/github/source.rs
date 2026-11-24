//! One connected repository: labelled issues in, marked comments out.

use serde_json::{json, Value};
use shep_app::ports::{HandOver, Reply, SourceError, TaskSource, Update};
use shep_domain::{SourceKind, TaskSourceRef, UnixTime};

use super::json::{by_shep, hand_over, has_label, is_issue, query, reply, BODY, NUMBER, STATE};
use super::SHEP_MARKER;
use crate::sources::http::{self, Http};
use crate::sources::stamp;
use crate::sources::words;

const AUTHORIZATION: &str = "Authorization";
const BEARER: &str = "Bearer";
const ACCEPT: &str = "Accept";
const GITHUB_JSON: &str = "application/vnd.github+json";
const API_VERSION_HEADER: &str = "X-GitHub-Api-Version";
/// The REST API version these requests and the fixtures follow.
const API_VERSION: &str = "2022-11-28";
const USER_PATH: &str = "/user";
const REPOS_PATH: &str = "/repos";
const ISSUES_SEGMENT: &str = "issues";
const COMMENTS_SEGMENT: &str = "comments";
const LOGIN_FIELD: &str = "login";
/// The most GitHub returns per page.
const PAGE_SIZE: &str = "100";
const OPEN: &str = "open";
const STATE_PARAM: &str = "state";
const LABELS_PARAM: &str = "labels";
const PER_PAGE_PARAM: &str = "per_page";
const SINCE_PARAM: &str = "since";
const SORT_PARAM: &str = "sort";
const BY_CREATED: &str = "created";
const DIRECTION_PARAM: &str = "direction";
const NEWEST_FIRST: &str = "desc";
const ACCOUNT_SEPARATOR: &str = " · ";

pub struct GitHubSource {
    http: Http,
    /// `Bearer <token>`.
    auth: String,
    /// `owner/name`: where `#412` and labelled issues live.
    repo: String,
    label: String,
}

impl GitHubSource {
    pub fn new(http: Http, token: &str, repo: &str, label: &str) -> Self {
        Self {
            http,
            auth: format!("{BEARER} {token}"),
            repo: repo.to_owned(),
            label: label.to_owned(),
        }
    }

    fn headers(&self) -> [(&str, &str); 3] {
        [
            (AUTHORIZATION, self.auth.as_str()),
            (ACCEPT, GITHUB_JSON),
            (API_VERSION_HEADER, API_VERSION),
        ]
    }

    fn get(&self, path: &str) -> Result<Value, SourceError> {
        self.http.get(path, &self.headers())
    }

    /// Who the token belongs to, from `GET /user`.
    pub(super) fn login(&self) -> Result<String, SourceError> {
        self.get(USER_PATH)?[LOGIN_FIELD]
            .as_str()
            .map(str::to_owned)
            .ok_or_else(|| SourceError(format!("GitHub {USER_PATH} answered without a login")))
    }

    /// The repository, which proves the token can see it.
    pub(super) fn repository(&self) -> Result<Value, SourceError> {
        self.get(&format!("{REPOS_PATH}/{}", self.repo))
    }

    /// `owner/name` and number of an issue reference.
    fn place<'a>(&'a self, source: &'a TaskSourceRef) -> Result<(&'a str, u64), SourceError> {
        match source {
            TaskSourceRef::GitHubIssue { repo, number } => {
                Ok((repo.as_deref().unwrap_or(&self.repo), *number))
            }
            other => Err(SourceError(format!("{other} is not a GitHub issue"))),
        }
    }

    /// Open issues (and pull requests, which GitHub lists as issues) by the query given.
    fn open_issues(&self, filters: &[(&str, &str)]) -> Result<Vec<Value>, SourceError> {
        let mut pairs = vec![(STATE_PARAM, OPEN)];
        pairs.extend_from_slice(filters);
        pairs.push((PER_PAGE_PARAM, PAGE_SIZE));
        let path = format!("{}?{}", issues_path(&self.repo), query(&pairs));
        Ok(as_list(self.get(&path)?))
    }
}

impl TaskSource for GitHubSource {
    fn kind(&self) -> SourceKind {
        SourceKind::GitHub
    }

    fn connection(&self) -> Result<String, SourceError> {
        Ok(format!(
            "@{}{ACCOUNT_SEPARATOR}{}",
            self.login()?,
            self.repo
        ))
    }

    fn poll(&self) -> Result<Vec<HandOver>, SourceError> {
        let issues = self.open_issues(&[(LABELS_PARAM, &self.label)])?;
        Ok(issues
            .iter()
            .filter(|i| is_issue(i) && has_label(i, &self.label))
            .filter_map(listed)
            .collect())
    }

    fn read(&self, source: &TaskSourceRef) -> Result<Option<HandOver>, SourceError> {
        let (repo, number) = self.place(source)?;
        let issue = match self.get(&issue_path(repo, number)) {
            Ok(issue) => issue,
            Err(e) if http::is_gone(&e) => return Ok(None),
            Err(e) => return Err(e),
        };
        if !is_issue(&issue) || issue[STATE].as_str() != Some(OPEN) {
            return Ok(None);
        }
        hand_over(&issue, source.clone())
            .map(Some)
            .ok_or_else(|| SourceError(format!("GitHub sent an unreadable issue {source}")))
    }

    fn report(&self, source: &TaskSourceRef, update: &Update) -> Result<(), SourceError> {
        let (repo, number) = self.place(source)?;
        let body = format!(
            "{}\n\n{SHEP_MARKER}",
            words::markdown(&words::lines(update))
        );
        self.http.post(
            &comments_path(repo, number),
            &self.headers(),
            &json!({ BODY: body }),
        )?;
        Ok(())
    }

    fn replies(&self, source: &TaskSourceRef, since: UnixTime) -> Result<Vec<Reply>, SourceError> {
        let (repo, number) = self.place(source)?;
        let from = stamp::format(since);
        let pairs = [(SINCE_PARAM, from.as_str()), (PER_PAGE_PARAM, PAGE_SIZE)];
        let path = format!("{}?{}", comments_path(repo, number), query(&pairs));
        let mut replies: Vec<Reply> = as_list(self.get(&path)?)
            .iter()
            .filter(|c| !by_shep(c))
            .filter_map(reply)
            .filter(|r| r.at() >= since)
            .collect();
        replies.sort_by_key(Reply::at);
        Ok(replies)
    }

    fn candidates(&self, limit: usize) -> Result<Vec<HandOver>, SourceError> {
        let issues =
            self.open_issues(&[(SORT_PARAM, BY_CREATED), (DIRECTION_PARAM, NEWEST_FIRST)])?;
        Ok(issues
            .iter()
            .filter(|i| is_issue(i))
            .filter_map(listed)
            .take(limit)
            .collect())
    }
}

/// An issue listed for this repository, as Shep refers to it (`#412`).
fn listed(issue: &Value) -> Option<HandOver> {
    let number = issue[NUMBER].as_u64()?;
    hand_over(issue, TaskSourceRef::GitHubIssue { repo: None, number })
}

fn issues_path(repo: &str) -> String {
    format!("{REPOS_PATH}/{repo}/{ISSUES_SEGMENT}")
}

fn issue_path(repo: &str, number: u64) -> String {
    format!("{}/{number}", issues_path(repo))
}

fn comments_path(repo: &str, number: u64) -> String {
    format!("{}/{COMMENTS_SEGMENT}", issue_path(repo, number))
}

fn as_list(value: Value) -> Vec<Value> {
    match value {
        Value::Array(items) => items,
        _ => Vec::new(),
    }
}
