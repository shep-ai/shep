//! What Shep says in a tracker (Jira, Notion, Monday): the same words in each, marked so Shep
//! knows its own posts when it reads replies, and the small helpers the three adapters share.

use std::collections::BTreeMap;

use shep_app::ports::{FormField, Reply, SourceError, Update};
use shep_domain::{PullRequest, SourceKind, UnixTime, SEND_BACK_PREFIX};

/// Starts every post Shep makes, so `replies` can skip them (Shep posts with the person's own
/// token, so the author cannot tell them apart).
pub const SHEP_MARK: &str = "🐑 Shep:";
/// The status (or label) a person moves work to when they hand it to Shep.
pub const TONIGHT: &str = "Tonight";
/// The text an HTTP error carries when the item is gone (see `http::Http::send`).
const NOT_FOUND: &str = "answered 404";
/// Jira writes offsets without a colon (`+0000`), which RFC 3339 does not allow.
const OFFSET_WITHOUT_COLON: &str = "%Y-%m-%dT%H:%M:%S%.f%z";

/// Part of a line Shep posts: plain words or a link.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Piece {
    Text(String),
    Link { text: String, url: String },
}

/// One paragraph of a post.
pub type Line = Vec<Piece>;

fn text(s: impl Into<String>) -> Piece {
    Piece::Text(s.into())
}

fn pr_link(pr: &PullRequest) -> Piece {
    Piece::Link {
        text: format!("pull request #{}", pr.number),
        url: pr.url.clone(),
    }
}

/// "Queued for tonight, 23:00 · acme/app", or when it waits for `shep go`.
pub fn queued_words(update: &Update) -> Option<String> {
    let Update::Queued { starts, repo } = update else {
        return None;
    };
    let when = starts.map_or_else(
        || String::from("Queued; it starts when you run shep go"),
        |at| format!("Queued for tonight, {at}"),
    );
    Some(match repo {
        Some(repo) => format!("{when} · {repo}"),
        None => when,
    })
}

/// The post for an update, one line per paragraph; the first line starts with [`SHEP_MARK`].
pub fn message(update: &Update) -> Vec<Line> {
    let mark = |words: &str| text(format!("{SHEP_MARK} {words}"));
    match update {
        Update::Queued { .. } => vec![vec![mark(&queued_words(update).unwrap_or_default())]],
        Update::Asked { question } => vec![
            vec![mark("A question before I go on:")],
            vec![text(question.trim())],
            vec![text("Reply here and I will pick it up.")],
        ],
        Update::Ready { pr, summary, .. } => {
            let mut first = vec![mark("Ready for review: "), pr_link(pr)];
            if !summary.trim().is_empty() {
                first.push(text(format!(" · {}", summary.trim())));
            }
            let send_back =
                format!("Reply \"{SEND_BACK_PREFIX} <what to change>\" to send it back.");
            vec![first, vec![text(send_back)]]
        }
        Update::Merged { pr } => vec![vec![mark("Merged "), pr_link(pr)]],
        Update::Stopped { reason } => vec![vec![mark(&format!("Stopped: {}", reason.trim()))]],
    }
}

/// Whether a post is one of Shep's own.
pub fn is_shep(text: &str) -> bool {
    text.trim_start().starts_with(SHEP_MARK)
}

/// Something written on an item, before Shep sorts out what counts as a reply.
#[derive(Debug, Clone)]
pub struct Said {
    pub at: UnixTime,
    pub author: String,
    pub text: String,
}

/// What people (not Shep) wrote at or after `since`, oldest first.
pub fn replies_since(said: Vec<Said>, since: UnixTime) -> Vec<Reply> {
    let mut kept: Vec<Said> = said
        .into_iter()
        .filter(|s| s.at >= since && !is_shep(&s.text) && !s.text.trim().is_empty())
        .collect();
    kept.sort_by_key(|s| s.at);
    kept.into_iter()
        .map(|s| Reply::Said {
            at: s.at,
            author: s.author,
            text: s.text.trim().to_owned(),
        })
        .collect()
}

/// An ISO 8601 time as the trackers write it (`Z`, `+01:00` or `+0100`).
pub fn parse_time(value: &str) -> Result<UnixTime, SourceError> {
    chrono::DateTime::parse_from_rfc3339(value)
        .or_else(|_| chrono::DateTime::parse_from_str(value, OFFSET_WITHOUT_COLON))
        .map(|t| UnixTime(t.timestamp()))
        .map_err(|e| SourceError(format!("unexpected time {value:?}: {e}")))
}

/// Whether a failed call means the item is gone (deleted, or no longer shared with Shep).
pub fn is_not_found(error: &SourceError) -> bool {
    error.0.contains(NOT_FOUND)
}

/// Names compared the way people read them: case and surrounding spaces do not matter.
pub fn same_name(a: &str, b: &str) -> bool {
    a.trim().eq_ignore_ascii_case(b.trim())
}

pub fn field(key: &str, label: &str, secret: bool, hint: &str, optional: bool) -> FormField {
    FormField {
        key: key.to_owned(),
        label: label.to_owned(),
        secret,
        hint: hint.to_owned(),
        optional,
    }
}

/// A form value that must be there, trimmed.
pub fn required(
    values: &BTreeMap<String, String>,
    kind: SourceKind,
    key: &str,
    what: &str,
) -> Result<String, SourceError> {
    optional(values, key)
        .ok_or_else(|| SourceError(format!("{} needs {what}", kind.display_name())))
}

/// A form value, trimmed; `None` when empty.
pub fn optional(values: &BTreeMap<String, String>, key: &str) -> Option<String> {
    values
        .get(key)
        .map(|v| v.trim().to_owned())
        .filter(|v| !v.is_empty())
}

/// A saved option a connected source cannot work without.
pub fn saved(
    options: &BTreeMap<String, String>,
    kind: SourceKind,
    key: &str,
) -> Result<String, SourceError> {
    optional(options, key).ok_or_else(|| {
        SourceError(format!(
            "{} is missing its {key}; run shep config --connect {}",
            kind.display_name(),
            kind.cli_name()
        ))
    })
}

/// A query-string value, percent-encoded (RFC 3986 unreserved characters pass as they are).
pub fn encode(value: &str) -> String {
    value
        .bytes()
        .map(|b| match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'.' | b'_' | b'~' => {
                char::from(b).to_string()
            }
            _ => format!("%{b:02X}"),
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use shep_domain::ClockTime;

    #[test]
    fn every_post_starts_with_the_mark_and_replies_skip_it() {
        let queued = Update::Queued {
            starts: Some(ClockTime::parse("23:00").unwrap()),
            repo: None,
        };
        let lines = message(&queued);
        assert_eq!(
            lines[0][0],
            Piece::Text(format!("{SHEP_MARK} Queued for tonight, 23:00"))
        );
        let said = |text: &str, at| Said {
            at: UnixTime(at),
            author: "Dana".into(),
            text: text.into(),
        };
        let replies = replies_since(
            vec![
                said("late", 30),
                said(&format!("{SHEP_MARK} hi"), 20),
                said("early", 5),
                said("on time", 10),
            ],
            UnixTime(10),
        );
        let texts: Vec<String> = replies
            .iter()
            .map(|r| match r {
                Reply::Said { text, .. } => text.clone(),
                Reply::Merge { .. } => String::new(),
            })
            .collect();
        assert_eq!(texts, ["on time", "late"]);
    }

    #[test]
    fn times_parse_with_or_without_the_offset_colon() {
        assert_eq!(
            parse_time("2026-11-14T08:10:00.000Z").unwrap(),
            UnixTime(1_794_643_800)
        );
        assert_eq!(
            parse_time("2026-11-14T09:10:00.000+0100").unwrap(),
            UnixTime(1_794_643_800)
        );
        assert!(parse_time("yesterday").is_err());
        assert_eq!(encode("a b/\"c\""), "a%20b%2F%22c%22");
    }
}
