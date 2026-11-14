//! What `gh … --json` prints, and how it reads as Shep's types.

use serde::Deserialize;
use shep_app::ports::{ForgeError, IssueState, PrComment};
use shep_domain::{CheckState, UnixTime};

/// What `gh` calls an issue that is no longer wanted.
const CLOSED: &str = "CLOSED";

#[derive(Deserialize)]
pub(super) struct IssueJson {
    pub title: String,
    #[serde(default)]
    pub body: String,
    pub url: String,
}

#[derive(Deserialize)]
pub(super) struct IssueRefJson {
    pub number: u64,
    pub title: String,
}

#[derive(Deserialize)]
pub(super) struct CheckJson {
    pub name: String,
    pub bucket: String,
    #[serde(default)]
    pub link: String,
}

#[derive(Deserialize)]
struct StateJson {
    state: String,
}

#[derive(Deserialize)]
struct CommentsJson {
    #[serde(default)]
    comments: Vec<CommentJson>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct CommentJson {
    /// `null` for a deleted account.
    #[serde(default)]
    author: Option<AuthorJson>,
    #[serde(default)]
    body: String,
    created_at: String,
}

#[derive(Deserialize)]
struct AuthorJson {
    login: String,
}

pub(super) fn parse<'a, T: Deserialize<'a>>(what: &str, json: &'a str) -> Result<T, ForgeError> {
    serde_json::from_str(json).map_err(|e| ForgeError(format!("unexpected {what} from gh: {e}")))
}

pub(super) fn bucket(name: &str) -> CheckState {
    match name {
        "pass" => CheckState::Passed,
        "fail" | "cancel" => CheckState::Failed,
        "skipping" => CheckState::Skipped,
        _ => CheckState::Pending,
    }
}

pub(super) fn issue_state(json: &str) -> Result<IssueState, ForgeError> {
    let issue: StateJson = parse("issue state", json)?;
    Ok(if issue.state.eq_ignore_ascii_case(CLOSED) {
        IssueState::Closed
    } else {
        IssueState::Open
    })
}

/// A comment whose author is gone has no login, so it can never be the person's.
pub(super) fn comments(json: &str) -> Result<Vec<PrComment>, ForgeError> {
    let list: CommentsJson = parse("comments", json)?;
    list.comments
        .into_iter()
        .map(|c| {
            let at = chrono::DateTime::parse_from_rfc3339(&c.created_at).map_err(|e| {
                ForgeError(format!("unexpected comment time {:?}: {e}", c.created_at))
            })?;
            Ok(PrComment {
                author: c.author.map(|a| a.login).unwrap_or_default(),
                body: c.body,
                at: UnixTime(at.timestamp()),
            })
        })
        .collect()
}
