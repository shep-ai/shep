//! What the mock model answers. A task prompt gets one shell command (Claude Code's `Bash`
//! tool), chosen by what the prompt asks; the tool's result ends the turn with a short text.
//!
//! | Prompt | Command |
//! | ------ | ------- |
//! | the second-opinion reviewer | writes a review to `$SHEP_REVIEW_FILE` |
//! | "CI failed" | appends to `MOCK_FIX.md` and commits it |
//! | contains `[mock:ask]` | writes a question to `$SHEP_QUESTION_FILE` |
//! | anything else | appends to `MOCK_CHANGE.md`, saves test proof in `$SHEP_PROOF_DIR` |

use std::sync::atomic::{AtomicU64, Ordering};

use serde_json::{json, Value};

/// Every message and tool call gets an id of its own, as the real API does; Claude Code drops a
/// reply whose id it has already seen in the conversation.
static NEXT_ID: AtomicU64 = AtomicU64::new(1);

const REVIEWER: &str = "second-opinion reviewer";
const CI_FIX: &str = "CI failed";
pub const ASK_MARKER: &str = "[mock:ask]";
const TOOL: &str = "Bash";
const SYSTEM_ROLE: &str = "system";
const USER_ROLE: &str = "user";

const REVIEW: &str =
    "printf 'Mock review: the change does what the task asks.\\n' > \"$SHEP_REVIEW_FILE\"";
const FIX: &str = "printf 'fixed by the mock model\\n' >> MOCK_FIX.md && git add -A && \
     git commit -q -m 'Fix CI (mock model)'";
const ASK: &str =
    "printf 'Which bucket should this use, prod or staging?\\n' > \"$SHEP_QUESTION_FILE\"";
const WORK: &str = "printf 'Changed by the mock model.\\n' >> MOCK_CHANGE.md && \
     mkdir -p \"$SHEP_PROOF_DIR\" && printf '$ make test\\n3 passed\\n' > \"$SHEP_PROOF_DIR/tests.txt\"";
const DONE: &str = "Done.";

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Reply {
    /// Run this shell command (the prompt it answers is kept for tests).
    Command {
        prompt: String,
        command: String,
    },
    Text(String),
}

pub fn reply(request: &Value) -> Reply {
    let has_tools = request["tools"].as_array().is_some_and(|t| !t.is_empty());
    let messages = request["messages"].as_array().cloned().unwrap_or_default();
    // Claude Code appends `system` messages (its environment notes) after the person's turn.
    let Some(last) = messages.iter().rev().find(|m| m["role"] != SYSTEM_ROLE) else {
        return Reply::Text(DONE.into());
    };
    if !has_tools || last["role"] != USER_ROLE || has_tool_result(last) {
        return Reply::Text(DONE.into());
    }
    let prompt = text_of(last);
    let command = if prompt.contains(REVIEWER) {
        REVIEW
    } else if prompt.contains(CI_FIX) {
        FIX
    } else if prompt.contains(ASK_MARKER) {
        ASK
    } else {
        WORK
    };
    Reply::Command {
        prompt,
        command: command.into(),
    }
}

fn has_tool_result(message: &Value) -> bool {
    message["content"]
        .as_array()
        .is_some_and(|blocks| blocks.iter().any(|b| b["type"] == "tool_result"))
}

/// The text of a message, whether its content is a string or blocks.
fn text_of(message: &Value) -> String {
    match &message["content"] {
        Value::String(text) => text.clone(),
        Value::Array(blocks) => blocks
            .iter()
            .filter_map(|b| b["text"].as_str())
            .collect::<Vec<_>>()
            .join("\n"),
        _ => String::new(),
    }
}

/// The Messages API stream for a reply: `(event name, data)` pairs.
pub fn events(reply: &Reply, model: &str) -> Vec<(&'static str, Value)> {
    let n = NEXT_ID.fetch_add(1, Ordering::Relaxed);
    let (block, delta, stop) = match reply {
        Reply::Command { command, .. } => (
            json!({ "type": "tool_use", "id": format!("toolu_mock_{n}"), "name": TOOL, "input": {} }),
            json!({
                "type": "input_json_delta",
                "partial_json": json!({ "command": command, "description": "Mock model step" }).to_string()
            }),
            "tool_use",
        ),
        Reply::Text(text) => (
            json!({ "type": "text", "text": "" }),
            json!({ "type": "text_delta", "text": text }),
            "end_turn",
        ),
    };
    vec![
        (
            "message_start",
            json!({ "type": "message_start", "message": {
                "id": format!("msg_mock_{n}"), "type": "message", "role": "assistant", "model": model,
                "content": [], "stop_reason": null, "stop_sequence": null,
                "usage": { "input_tokens": 1, "output_tokens": 1 }
            }}),
        ),
        (
            "content_block_start",
            json!({ "type": "content_block_start", "index": 0, "content_block": block }),
        ),
        (
            "content_block_delta",
            json!({ "type": "content_block_delta", "index": 0, "delta": delta }),
        ),
        (
            "content_block_stop",
            json!({ "type": "content_block_stop", "index": 0 }),
        ),
        (
            "message_delta",
            json!({ "type": "message_delta",
                    "delta": { "stop_reason": stop, "stop_sequence": null },
                    "usage": { "output_tokens": 1 } }),
        ),
        ("message_stop", json!({ "type": "message_stop" })),
    ]
}
