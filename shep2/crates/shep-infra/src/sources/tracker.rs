//! What Shep says in a tracker (Jira, Notion, Monday): the same words in each, marked so Shep
//! knows its own posts when it reads replies, and the small helpers the three adapters share.

use std::collections::BTreeMap;

use shep_app::ports::{FormField, Reply, SourceError, Update};

use super::words;
use shep_domain::{SourceKind, UnixTime};

/// Starts every post Shep makes, so `replies` can skip them (Shep posts with the person's own
/// token, so the author cannot tell them apart).
pub const SHEP_MARK: &str = "🐑 Shep:";
/// The status (or label) a person moves work to when they hand it to Shep.
pub const TONIGHT: &str = "Tonight";

pub use super::words::{Line, Piece};

/// The post for an update, one line per paragraph; the first line starts with [`SHEP_MARK`].
pub fn message(update: &Update) -> Vec<Line> {
    words::marked(SHEP_MARK, words::lines(update))
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

pub(crate) use super::stamp::parse as parse_time;

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
        ..FormField::default()
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
            Piece::Text(format!(
                "{SHEP_MARK} Queued for tonight, 23:00. I'll reply here."
            ))
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
