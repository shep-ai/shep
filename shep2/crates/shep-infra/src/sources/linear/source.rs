//! One connected Linear workspace: issues labelled `shep` or in the Tonight state come in;
//! Shep answers with signed comments, moves the issue along and attaches the pull request.

use serde_json::{json, Value};
use shep_app::ports::{HandOver, Reply, SourceError, TaskSource, Update};
use shep_domain::{SourceKind, TaskSourceRef, UnixTime};

use super::documents::{
    self as doc, ATTACH, ATTACH_RESULT, COMMENT, COMMENT_RESULT, DONE_TYPES, MOVE, MOVE_RESULT,
    PLACE, REPLIES, VIEWER,
};
use super::graphql::Graphql;
use super::{account, HAND_OVER_LABEL, IN_REVIEW_STATE, SHEP_SIGNATURE, TONIGHT_STATE};
use crate::sources::stamp;
use crate::sources::words;

/// The most issues or comments one read asks for.
const PAGE_SIZE: usize = 100;
/// Who wrote a comment with no Linear user behind it (an integration).
const UNKNOWN_AUTHOR: &str = "Linear";
const PULL_REQUEST_TITLE: &str = "Pull request #";

pub struct LinearSource {
    api: Graphql,
    /// Only this team's issues, when set (`ENG`).
    team: Option<String>,
}

impl LinearSource {
    pub(super) fn new(api: Graphql, team: Option<String>) -> Self {
        Self { api, team }
    }

    fn issues(&self, document: &str, filter: &Value) -> Result<Vec<Value>, SourceError> {
        let data = self
            .api
            .data(document, &json!({ "filter": filter, "first": PAGE_SIZE }))?;
        Ok(nodes(&data["issues"]))
    }

    /// Comments on the issue, then moves it to the state named `to` when its team has one.
    fn say(&self, key: &str, update: &Update, to: Option<&str>) -> Result<(), SourceError> {
        let place = self.api.data(PLACE, &json!({ "id": key }))?;
        let issue = &place["issue"];
        let id = issue["id"]
            .as_str()
            .ok_or_else(|| SourceError(format!("Linear has no issue {key}")))?;
        if let Update::Ready { pr, summary, .. } = update {
            let input = json!({
                "issueId": id,
                "url": pr.url,
                "title": format!("{PULL_REQUEST_TITLE}{}", pr.number),
                "subtitle": summary,
            });
            self.api
                .mutate(ATTACH, ATTACH_RESULT, &json!({ "input": input }))?;
        }
        let body = format!(
            "{}\n\n{SHEP_SIGNATURE}",
            words::markdown(&words::lines(update))
        );
        let input = json!({ "issueId": id, "body": body });
        self.api
            .mutate(COMMENT, COMMENT_RESULT, &json!({ "input": input }))?;
        let state = to.and_then(|name| {
            nodes(&issue["team"]["states"]).into_iter().find(|s| {
                s["name"]
                    .as_str()
                    .is_some_and(|n| n.eq_ignore_ascii_case(name))
            })
        });
        if let Some(state_id) = state.as_ref().and_then(|s| s["id"].as_str()) {
            let variables = json!({ "id": id, "input": { "stateId": state_id } });
            self.api.mutate(MOVE, MOVE_RESULT, &variables)?;
        }
        Ok(())
    }
}

impl TaskSource for LinearSource {
    fn kind(&self) -> SourceKind {
        SourceKind::Linear
    }

    fn connection(&self) -> Result<String, SourceError> {
        let viewer = self.api.data(VIEWER, &json!({}))?;
        Ok(account(&viewer, self.team.as_deref()))
    }

    fn poll(&self) -> Result<Vec<HandOver>, SourceError> {
        let filter = doc::waiting_filter(HAND_OVER_LABEL, TONIGHT_STATE, self.team.as_deref());
        Ok(self
            .issues(&doc::waiting(), &filter)?
            .iter()
            .filter(|i| is_open(i) && (labelled(i) || state_is(i, TONIGHT_STATE)))
            .filter_map(hand_over)
            .collect())
    }

    fn read(&self, source: &TaskSourceRef) -> Result<Option<HandOver>, SourceError> {
        let key = key_of(source)?;
        let Some(data) = self.api.call(&doc::read(), &json!({ "id": key }))? else {
            return Ok(None);
        };
        let issue = &data["issue"];
        if issue.is_null() || !is_open(issue) {
            return Ok(None);
        }
        hand_over(issue)
            .map(Some)
            .ok_or_else(|| SourceError(format!("Linear sent an unreadable issue {key}")))
    }

    fn report(&self, source: &TaskSourceRef, update: &Update) -> Result<(), SourceError> {
        let key = key_of(source)?;
        let to = match update {
            Update::Queued { .. } => Some(TONIGHT_STATE),
            Update::Ready { .. } => Some(IN_REVIEW_STATE),
            Update::Asked { .. } | Update::Merged { .. } | Update::Stopped { .. } => None,
        };
        self.say(key, update, to)
    }

    fn replies(&self, source: &TaskSourceRef, since: UnixTime) -> Result<Vec<Reply>, SourceError> {
        let key = key_of(source)?;
        let variables = json!({
            "id": key,
            "filter": doc::since_filter(&stamp::format(since)),
            "first": PAGE_SIZE,
        });
        let data = self.api.data(REPLIES, &variables)?;
        let mut replies: Vec<Reply> = nodes(&data["issue"]["comments"])
            .iter()
            .filter(|c| !by_shep(c))
            .filter_map(reply)
            .filter(|r| r.at() >= since)
            .collect();
        replies.sort_by_key(Reply::at);
        Ok(replies)
    }

    fn candidates(&self, limit: usize) -> Result<Vec<HandOver>, SourceError> {
        let filter = doc::offer_filter(self.team.as_deref());
        let mut issues = self.issues(&doc::offer(), &filter)?;
        issues.sort_by_key(|i| std::cmp::Reverse(created(i)));
        Ok(issues.iter().filter_map(hand_over).take(limit).collect())
    }
}

fn key_of(source: &TaskSourceRef) -> Result<&str, SourceError> {
    match source {
        TaskSourceRef::Linear { key } => Ok(key),
        other => Err(SourceError(format!("{other} is not a Linear issue"))),
    }
}

/// A connection's `nodes`, or nothing.
fn nodes(connection: &Value) -> Vec<Value> {
    connection["nodes"].as_array().cloned().unwrap_or_default()
}

fn hand_over(issue: &Value) -> Option<HandOver> {
    Some(HandOver {
        source: TaskSourceRef::Linear {
            key: issue["identifier"].as_str()?.to_owned(),
        },
        title: issue["title"].as_str()?.to_owned(),
        body: issue["description"].as_str().unwrap_or_default().to_owned(),
        url: issue["url"].as_str()?.to_owned(),
    })
}

fn is_open(issue: &Value) -> bool {
    issue["state"]["type"]
        .as_str()
        .is_none_or(|t| !DONE_TYPES.contains(&t))
}

fn labelled(issue: &Value) -> bool {
    nodes(&issue["labels"]).iter().any(|l| {
        l["name"]
            .as_str()
            .is_some_and(|n| n.eq_ignore_ascii_case(HAND_OVER_LABEL))
    })
}

fn state_is(issue: &Value, name: &str) -> bool {
    issue["state"]["name"]
        .as_str()
        .is_some_and(|n| n.eq_ignore_ascii_case(name))
}

fn created(issue: &Value) -> UnixTime {
    issue["createdAt"]
        .as_str()
        .and_then(|t| stamp::parse(t).ok())
        .unwrap_or(UnixTime(0))
}

/// Shep's comments end with its signature: they are written as the key's own user, so the
/// author cannot tell them apart.
fn by_shep(comment: &Value) -> bool {
    comment["body"]
        .as_str()
        .is_some_and(|b| b.trim_end().ends_with(SHEP_SIGNATURE))
}

fn reply(comment: &Value) -> Option<Reply> {
    let user = &comment["user"];
    let author = user["name"]
        .as_str()
        .or_else(|| user["displayName"].as_str())
        .unwrap_or(UNKNOWN_AUTHOR);
    Some(Reply::Said {
        at: stamp::parse(comment["createdAt"].as_str()?).ok()?,
        author: author.to_owned(),
        text: comment["body"].as_str()?.trim().to_owned(),
    })
}
