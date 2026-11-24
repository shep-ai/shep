//! Reading GitHub's issue and comment objects, and writing query strings.

use std::fmt::Write as _;

use serde_json::Value;
use shep_app::ports::{HandOver, Reply};
use shep_domain::TaskSourceRef;

use super::SHEP_MARKER;
use crate::sources::stamp;

pub(super) const NUMBER: &str = "number";
pub(super) const STATE: &str = "state";
pub(super) const BODY: &str = "body";
const TITLE: &str = "title";
const HTML_URL: &str = "html_url";
const LABELS: &str = "labels";
const NAME: &str = "name";
/// Only pull requests carry it in an issue listing.
const PULL_REQUEST: &str = "pull_request";
const USER: &str = "user";
const LOGIN: &str = "login";
const CREATED_AT: &str = "created_at";
/// How GitHub names a deleted account.
const GHOST: &str = "ghost";
/// Characters a query value keeps as they are (RFC 3986 unreserved).
const UNRESERVED: &str = "-_.~";

/// An issue (not a pull request) as work handed over under `source`.
pub(super) fn hand_over(issue: &Value, source: TaskSourceRef) -> Option<HandOver> {
    Some(HandOver {
        source,
        title: issue[TITLE].as_str()?.to_owned(),
        body: issue[BODY].as_str().unwrap_or_default().to_owned(),
        url: issue[HTML_URL].as_str()?.to_owned(),
    })
}

/// GitHub lists pull requests as issues; they are not work to hand over.
pub(super) fn is_issue(issue: &Value) -> bool {
    issue.get(PULL_REQUEST).is_none()
}

/// Whether the issue carries `label` (labels are matched without regard to case, as GitHub
/// does).
pub(super) fn has_label(issue: &Value, label: &str) -> bool {
    issue[LABELS].as_array().is_some_and(|labels| {
        labels.iter().any(|l| {
            l[NAME]
                .as_str()
                .or_else(|| l.as_str())
                .is_some_and(|name| name.eq_ignore_ascii_case(label))
        })
    })
}

/// Whether Shep wrote this comment.
pub(super) fn by_shep(comment: &Value) -> bool {
    comment[BODY]
        .as_str()
        .is_some_and(|body| body.trim_end().ends_with(SHEP_MARKER))
}

/// A comment as something a person said.
pub(super) fn reply(comment: &Value) -> Option<Reply> {
    Some(Reply::Said {
        at: stamp::parse(comment[CREATED_AT].as_str()?).ok()?,
        author: comment[USER][LOGIN].as_str().unwrap_or(GHOST).to_owned(),
        text: comment[BODY].as_str()?.trim().to_owned(),
    })
}

/// `a=1&b=two%20words`.
pub(super) fn query(pairs: &[(&str, &str)]) -> String {
    pairs
        .iter()
        .map(|(k, v)| format!("{k}={}", encode(v)))
        .collect::<Vec<_>>()
        .join("&")
}

fn encode(value: &str) -> String {
    let mut out = String::with_capacity(value.len());
    for byte in value.bytes() {
        let c = char::from(byte);
        if c.is_ascii_alphanumeric() || UNRESERVED.contains(c) {
            out.push(c);
        } else {
            let _ = write!(out, "%{byte:02X}");
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    #[test]
    fn query_values_are_escaped() {
        assert_eq!(
            super::query(&[("labels", "good first"), ("since", "2026-11-13T18:10:00Z")]),
            "labels=good%20first&since=2026-11-13T18%3A10%3A00Z"
        );
        assert_eq!(super::query(&[("labels", "señal")]), "labels=se%C3%B1al");
    }

    #[test]
    fn labels_match_by_name_in_any_case() {
        let issue = json!({ "labels": [{ "name": "Shep" }, "bug"] });
        assert!(super::has_label(&issue, "shep"));
        assert!(super::has_label(&issue, "bug"));
        assert!(!super::has_label(&issue, "ui"));
    }
}
