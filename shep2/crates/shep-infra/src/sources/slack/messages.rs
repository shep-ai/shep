//! What Shep says in a thread, as `chat.postMessage` bodies (`text` is the notification and
//! fallback; `blocks` carry the Ready buttons), and the buttons' ids and values.

use serde_json::{json, Value};
use shep_app::ports::Update;
use shep_domain::{PullRequest, SEND_BACK_PREFIX};

pub const MERGE_ACTION: &str = "shep_merge";
pub const SEND_BACK_ACTION: &str = "shep_send_back";
pub const OPEN_PR_ACTION: &str = "shep_open_pr";
const REVIEW_BLOCK: &str = "shep_review";
/// A button's value names its thread: `<channel>/<thread ts>`.
const THREAD_SEPARATOR: char = '/';
const PRIMARY: &str = "primary";
const PULL_PATH: &str = "/pull/";
const GITHUB_PREFIX: &str = "https://github.com/";

/// Said privately to whoever pressed a button.
pub const MERGE_HEARD: &str = "Got it. I'll merge it within a few minutes and say so here.";
pub fn send_back_hint() -> String {
    format!(
        "Reply in this thread starting with `{SEND_BACK_PREFIX}` and say what to change; \
         I'll take it from there."
    )
}

/// The value of a button that acts on this thread.
pub fn thread_value(channel: &str, thread_ts: &str) -> String {
    format!("{channel}{THREAD_SEPARATOR}{thread_ts}")
}

/// `(channel, thread ts)` from a button's value.
pub fn parse_thread_value(value: &str) -> Option<(String, String)> {
    let (channel, thread_ts) = value.split_once(THREAD_SEPARATOR)?;
    let ok = !channel.is_empty() && !thread_ts.is_empty();
    ok.then(|| (channel.to_owned(), thread_ts.to_owned()))
}

/// The body for an update in the thread `(channel, thread_ts)`, without the channel.
pub fn render(update: &Update, channel: &str, thread_ts: &str) -> Value {
    match update {
        Update::Queued { starts, repo } => {
            let when = starts.map_or_else(
                || "when you run `shep go`".to_owned(),
                |t| format!("tonight at {t}"),
            );
            let place = repo
                .as_deref()
                .map(|r| format!(" in {r}"))
                .unwrap_or_default();
            text(&format!(
                "Got it. I'll work on this {when}{place} and reply here."
            ))
        }
        Update::Asked { question } => text(&format!(
            "{}\n_Reply in this thread and I'll pick it up from there._",
            escape(question)
        )),
        Update::Ready { pr, summary, .. } => ready(pr, summary, channel, thread_ts),
        Update::Merged { pr } => text(&format!("Merged {}.", link(pr))),
        Update::Stopped { reason } => text(&format!(
            "I've stopped working on this: {}.",
            escape(reason.trim_end_matches('.'))
        )),
    }
}

fn text(words: &str) -> Value {
    json!({ "text": words })
}

fn ready(pr: &PullRequest, summary: &str, channel: &str, thread_ts: &str) -> Value {
    let value = thread_value(channel, thread_ts);
    let mut blocks = vec![json!({
        "type": "section",
        "text": { "type": "mrkdwn", "text": format!("*Ready for review:* {}", link(pr)) }
    })];
    if !summary.trim().is_empty() {
        blocks.push(context(&escape(summary)));
    }
    blocks.push(json!({
        "type": "actions",
        "block_id": REVIEW_BLOCK,
        "elements": [
            button("Merge", MERGE_ACTION).merged(json!({ "value": value, "style": PRIMARY })),
            button("Send back", SEND_BACK_ACTION).merged(json!({ "value": value })),
            button("Open PR", OPEN_PR_ACTION).merged(json!({ "url": pr.url })),
        ]
    }));
    blocks.push(context(&format!(
        "To send it back, reply in this thread starting with `{SEND_BACK_PREFIX}` and what to change."
    )));
    json!({
        "text": format!("Ready for review: {} {}", label(pr), pr.url),
        "blocks": blocks,
    })
}

fn context(mrkdwn: &str) -> Value {
    json!({ "type": "context", "elements": [{ "type": "mrkdwn", "text": mrkdwn }] })
}

fn button(words: &str, action: &str) -> Value {
    json!({
        "type": "button",
        "action_id": action,
        "text": { "type": "plain_text", "text": words },
    })
}

trait Merged {
    fn merged(self, more: Value) -> Value;
}

impl Merged for Value {
    fn merged(mut self, more: Value) -> Value {
        if let (Some(into), Value::Object(from)) = (self.as_object_mut(), more) {
            into.extend(from);
        }
        self
    }
}

/// `<url|acme/storefront#101>`.
fn link(pr: &PullRequest) -> String {
    format!("<{}|{}>", pr.url, label(pr))
}

/// `acme/storefront#101` for a GitHub pull request, `#101` otherwise.
fn label(pr: &PullRequest) -> String {
    pr.url
        .strip_prefix(GITHUB_PREFIX)
        .and_then(|rest| rest.split_once(PULL_PATH))
        .map_or_else(
            || format!("#{}", pr.number),
            |(repo, _)| format!("{repo}#{}", pr.number),
        )
}

/// Slack's three control characters in text Shep did not write.
pub fn escape(text: &str) -> String {
    text.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
}
