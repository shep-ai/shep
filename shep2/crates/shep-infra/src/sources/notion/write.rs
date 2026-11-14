//! What Shep writes on a Notion page: rich text for comments and blocks, and property values
//! for the `Shep` and `PR` properties, only of the kinds the person made.

use serde_json::{json, Map, Value};
use shep_app::ports::Update;

use crate::sources::tracker::{same_name, Line, Piece};

/// Notion refuses a text object longer than this.
const MAX_TEXT: usize = 2000;
pub(super) const RICH_TEXT: &str = "rich_text";
pub(super) const SELECT: &str = "select";
pub(super) const STATUS: &str = "status";
pub(super) const URL: &str = "url";
pub(super) const TITLE: &str = "title";
const PARAGRAPH: &str = "paragraph";
const LINE_BREAK: &str = "\n";

fn text_object(content: &str, link: Option<&str>) -> Value {
    let content: String = content.chars().take(MAX_TEXT).collect();
    match link {
        Some(url) => {
            json!({ "type": "text", "text": { "content": content, "link": { "url": url } } })
        }
        None => json!({ "type": "text", "text": { "content": content } }),
    }
}

fn line_text(line: &Line) -> Vec<Value> {
    line.iter()
        .filter_map(|piece| match piece {
            Piece::Text(text) if text.is_empty() => None,
            Piece::Text(text) => Some(text_object(text, None)),
            Piece::Link { text, url } => Some(text_object(text, Some(url))),
        })
        .collect()
}

/// One rich text value, lines separated by line breaks (a comment).
pub(super) fn rich_text(lines: &[Line]) -> Vec<Value> {
    let mut out = Vec::new();
    for (i, line) in lines.iter().enumerate() {
        if i > 0 {
            out.push(text_object(LINE_BREAK, None));
        }
        out.extend(line_text(line));
    }
    out
}

/// One paragraph block per line (appended to a page).
pub(super) fn paragraphs(lines: &[Line]) -> Vec<Value> {
    lines
        .iter()
        .map(|line| json!({ "object": "block", "type": PARAGRAPH, PARAGRAPH: { RICH_TEXT: line_text(line) } }))
        .collect()
}

/// The words of a rich text array as people read them.
pub(super) fn plain(rich_text: &Value) -> String {
    rich_text
        .as_array()
        .into_iter()
        .flatten()
        .map(|t| t["plain_text"].as_str().unwrap_or_default())
        .collect()
}

/// What the `Shep` property says for an update: a short phrase, and the word a select option
/// for it would start with ("Queued", "Ready for review").
pub(super) struct ShepWords {
    pub word: &'static str,
    pub text: String,
}

pub(super) fn shep_words(update: &Update) -> ShepWords {
    let (word, text) = match update {
        Update::Queued {
            starts: Some(at), ..
        } => ("queued", format!("queued for {at}")),
        Update::Queued { starts: None, .. } => ("queued", "queued; starts with shep go".into()),
        Update::Asked { .. } => ("asked", "asked a question".into()),
        Update::Ready { .. } => ("ready", "ready for review".into()),
        Update::Merged { .. } => ("merged", "merged".into()),
        Update::Stopped { reason } => ("stopped", format!("stopped: {}", reason.trim())),
    };
    ShepWords { word, text }
}

/// The name of a property called one of `names` whose type is one of `kinds`.
pub(super) fn find<'a>(
    props: &'a Map<String, Value>,
    names: &[&str],
    kinds: &[&str],
) -> Option<&'a str> {
    names.iter().find_map(|wanted| {
        props.iter().find_map(|(name, prop)| {
            let kind = prop["type"].as_str().unwrap_or_default();
            (same_name(name, wanted) && kinds.contains(&kind)).then_some(name.as_str())
        })
    })
}

/// A rich text value, or the select option the person made for it (`options` is the schema's
/// list); `None` when a select has no fitting option, since Shep creates none.
pub(super) fn shep_value(kind: &str, words: &ShepWords, options: &Value) -> Option<Value> {
    if kind == RICH_TEXT {
        return Some(json!({ RICH_TEXT: [text_object(&words.text, None)] }));
    }
    let names: Vec<&str> = options
        .as_array()
        .into_iter()
        .flatten()
        .filter_map(|o| o["name"].as_str())
        .collect();
    let chosen = names
        .iter()
        .find(|n| same_name(n, &words.text))
        .or_else(|| {
            names
                .iter()
                .find(|n| n.to_ascii_lowercase().starts_with(words.word))
        })?;
    Some(json!({ SELECT: { "name": chosen } }))
}
