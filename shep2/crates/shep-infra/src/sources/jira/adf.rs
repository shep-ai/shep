//! Atlassian Document Format, the rich text Jira's REST v3 uses for descriptions and comments:
//! Shep's posts become a document, and a document becomes plain text for the agent and replies.

use serde_json::{json, Value};

use crate::sources::tracker::{Line, Piece};

const DOC: &str = "doc";
const ADF_VERSION: u32 = 1;
const PARAGRAPH: &str = "paragraph";
const TEXT: &str = "text";
const LINK: &str = "link";
const HARD_BREAK: &str = "hardBreak";
/// Inline nodes whose words live in `attrs.text` (`@Mia`, `:sheep:`).
const ATTR_TEXT_NODES: [&str; 3] = ["mention", "emoji", "status"];
/// Inline nodes whose words are a link in `attrs.url`.
const ATTR_URL_NODES: [&str; 2] = ["inlineCard", "blockCard"];

/// A document with one paragraph per line.
pub fn document(lines: &[Line]) -> Value {
    let content: Vec<Value> = lines.iter().map(paragraph).collect();
    json!({ "type": DOC, "version": ADF_VERSION, "content": content })
}

fn paragraph(line: &Line) -> Value {
    let content: Vec<Value> = line
        .iter()
        .filter_map(|piece| match piece {
            Piece::Text(text) if text.is_empty() => None,
            Piece::Text(text) => Some(json!({ "type": TEXT, "text": text })),
            Piece::Link { text, url } => Some(json!({
                "type": TEXT,
                "text": text,
                "marks": [{ "type": LINK, "attrs": { "href": url } }]
            })),
        })
        .collect();
    json!({ "type": PARAGRAPH, "content": content })
}

/// The words of a document, one line per block; `null` reads as empty.
pub fn plain_text(node: &Value) -> String {
    let mut out = String::new();
    walk(node, &mut out);
    out.trim().to_owned()
}

fn walk(node: &Value, out: &mut String) {
    let kind = node["type"].as_str().unwrap_or_default();
    let attr = |key: &str| node["attrs"][key].as_str().unwrap_or_default().to_owned();
    match kind {
        TEXT => out.push_str(node[TEXT].as_str().unwrap_or_default()),
        HARD_BREAK => out.push('\n'),
        k if ATTR_TEXT_NODES.contains(&k) => out.push_str(&attr(TEXT)),
        k if ATTR_URL_NODES.contains(&k) => out.push_str(&attr("url")),
        _ => {}
    }
    let Some(children) = node["content"].as_array() else {
        return;
    };
    for child in children {
        walk(child, out);
    }
    if kind != DOC && !out.ends_with('\n') {
        out.push('\n');
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_post_round_trips_to_the_same_words() {
        let lines = vec![
            vec![
                Piece::Text("Ready: ".into()),
                Piece::Link {
                    text: "pull request #1".into(),
                    url: "https://x/1".into(),
                },
            ],
            vec![Piece::Text("Reply here.".into())],
        ];
        let doc = document(&lines);
        assert_eq!(
            doc["content"][0]["content"][1]["marks"][0]["attrs"]["href"],
            "https://x/1"
        );
        assert_eq!(plain_text(&doc), "Ready: pull request #1\nReply here.");
        assert_eq!(plain_text(&Value::Null), "");
    }
}
