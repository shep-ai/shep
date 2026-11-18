//! Reading Slack: one message, a thread since a time, a permalink, recent messages worth
//! handing over, and message text as people read it.

use serde_json::Value;
use shep_app::ports::{HandOver, SourceError};
use shep_domain::TaskSourceRef;

use super::api::{Api, Identity, GET_PERMALINK, HISTORY, MEMBER_OF, REPLIES};
use super::events::HAND_OVER_REACTION;
use super::link::ts_order;

const TRUE: &str = "true";
/// Replies read per thread; a thread rarely has more after Shep last spoke.
const THREAD_PAGE: &str = "200";
/// Onboarding looks at this many of the channels Shep was added to...
const CANDIDATE_CHANNELS: usize = 5;
/// ...and this many recent messages in each.
const CANDIDATE_SCAN: &str = "20";
const CHANNEL_TYPES: &str = "public_channel,private_channel";
const CHANNELS_PAGE: &str = "100";
/// The one subtype that is still a person talking: a reply also sent to the channel.
const THREAD_BROADCAST: &str = "thread_broadcast";
const UNTITLED: &str = "A Slack message";

/// The message `ts` in `channel`; `None` when it is gone.
pub fn message(api: &Api, channel: &str, ts: &str) -> Result<Option<Value>, SourceError> {
    let args = [
        ("channel", channel),
        ("ts", ts),
        ("latest", ts),
        ("oldest", ts),
        ("inclusive", TRUE),
    ];
    match api.get(REPLIES, &args) {
        Ok(answer) => Ok(messages(&answer).iter().find(|m| m["ts"] == ts).cloned()),
        Err(failure) if failure.is_gone() => Ok(None),
        Err(failure) => Err(failure.into()),
    }
}

/// Messages in a thread posted at or after `since` (Unix seconds), oldest first.
pub fn thread_since(
    api: &Api,
    channel: &str,
    thread_ts: &str,
    since: i64,
) -> Result<Vec<Value>, SourceError> {
    let oldest = format!("{since}.000000");
    let args = [
        ("channel", channel),
        ("ts", thread_ts),
        ("oldest", oldest.as_str()),
        ("inclusive", TRUE),
        ("limit", THREAD_PAGE),
    ];
    Ok(messages(&api.get(REPLIES, &args)?).to_vec())
}

pub fn permalink(api: &Api, channel: &str, ts: &str) -> Result<String, SourceError> {
    let answer = api.get(GET_PERMALINK, &[("channel", channel), ("message_ts", ts)])?;
    answer["permalink"]
        .as_str()
        .map(str::to_owned)
        .ok_or_else(|| SourceError("Slack gave no link for the message".into()))
}

/// The work in a message, found at `url`.
pub fn hand_over(url: &str, message: &Value, me: &Identity) -> HandOver {
    let body = plain(message["text"].as_str().unwrap_or_default(), &me.user_id);
    let title = body
        .lines()
        .map(str::trim)
        .find(|line| !line.is_empty())
        .unwrap_or(UNTITLED)
        .to_owned();
    HandOver {
        source: TaskSourceRef::Slack {
            url: url.to_owned(),
        },
        title,
        body,
        url: url.to_owned(),
    }
}

/// Written by a person (not Shep, not another app), as a plain message or a broadcast reply.
pub fn from_person(message: &Value, me: &Identity) -> bool {
    let plain = match message["subtype"].as_str() {
        None => true,
        Some(subtype) => subtype == THREAD_BROADCAST,
    };
    let user = message["user"].as_str().unwrap_or_default();
    plain && message["bot_id"].is_null() && !user.is_empty() && user != me.user_id
}

/// Recent top-level messages from people, in the channels Shep was added to, that nobody has
/// handed over yet; newest first.
pub fn candidates(api: &Api, me: &Identity, limit: usize) -> Result<Vec<HandOver>, SourceError> {
    let joined = api.get(
        MEMBER_OF,
        &[
            ("types", CHANNEL_TYPES),
            ("exclude_archived", TRUE),
            ("limit", CHANNELS_PAGE),
        ],
    )?;
    let mut found: Vec<(String, Value)> = Vec::new();
    let channels = joined["channels"]
        .as_array()
        .map(Vec::as_slice)
        .unwrap_or_default();
    for channel in channels.iter().take(CANDIDATE_CHANNELS) {
        let Some(id) = channel["id"].as_str() else {
            continue;
        };
        let history = api.get(HISTORY, &[("channel", id), ("limit", CANDIDATE_SCAN)])?;
        found.extend(
            messages(&history)
                .iter()
                .filter(|m| worth_offering(m, me))
                .map(|m| (id.to_owned(), m.clone())),
        );
    }
    let ts = |m: &Value| ts_order(m["ts"].as_str().unwrap_or_default());
    found.sort_by_key(|(_, m)| std::cmp::Reverse(ts(m)));
    found.truncate(limit);
    found
        .iter()
        .map(|(channel, m)| {
            let url = permalink(api, channel, m["ts"].as_str().unwrap_or_default())?;
            Ok(hand_over(&url, m, me))
        })
        .collect()
}

fn worth_offering(message: &Value, me: &Identity) -> bool {
    let ts = &message["ts"];
    let top_level = message["thread_ts"].is_null() || message["thread_ts"] == *ts;
    let handed = message["reactions"]
        .as_array()
        .is_some_and(|r| r.iter().any(|r| r["name"] == HAND_OVER_REACTION));
    let said = message["text"]
        .as_str()
        .is_some_and(|t| !t.trim().is_empty());
    from_person(message, me) && top_level && !handed && said
}

fn messages(answer: &Value) -> &[Value] {
    answer["messages"]
        .as_array()
        .map(Vec::as_slice)
        .unwrap_or_default()
}

/// Slack's markup as people read it: links show their label, Shep's own mention goes, and
/// `&amp;` `&lt;` `&gt;` are characters again.
pub fn plain(text: &str, me: &str) -> String {
    let mention = format!("<@{me}>");
    let mut out = String::with_capacity(text.len());
    let mut rest = text.replace(&mention, "");
    rest = rest.trim().to_owned();
    while let Some(open) = rest.find('<') {
        out.push_str(&rest[..open]);
        let Some(close) = rest[open..].find('>') else {
            out.push_str(&rest[open..]);
            rest.clear();
            break;
        };
        out.push_str(&markup(&rest[open + 1..open + close]));
        rest = rest[open + close + 1..].to_owned();
    }
    out.push_str(&rest);
    out.replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&amp;", "&")
}

/// One `<...>`: `url|label`, `@U123`, `#C123|name`, `!here`.
fn markup(inner: &str) -> String {
    let (target, label) = inner.split_once('|').unwrap_or((inner, ""));
    match target.chars().next() {
        Some('#') if !label.is_empty() => format!("#{label}"),
        Some('@' | '#') => target.to_owned(),
        Some('!') => format!("@{}", label_or(label, &target[1..])),
        _ => label_or(label, target).to_owned(),
    }
}

fn label_or<'a>(label: &'a str, fallback: &'a str) -> &'a str {
    if label.is_empty() {
        fallback
    } else {
        label
    }
}
