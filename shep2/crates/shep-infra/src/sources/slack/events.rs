//! Socket Mode frames, read: `hello`, `disconnect`, and envelopes (`envelope_id` plus a
//! `payload`) carrying an Events API callback or an interaction.

use serde_json::Value;

use super::inbox::{Handed, Press};
use super::link::ts_seconds;
use super::messages::{parse_thread_value, MERGE_ACTION, SEND_BACK_ACTION};

const HELLO: &str = "hello";
const DISCONNECT: &str = "disconnect";
const EVENTS_API: &str = "events_api";
const INTERACTIVE: &str = "interactive";
const REACTION_ADDED: &str = "reaction_added";
const APP_MENTION: &str = "app_mention";
const BLOCK_ACTIONS: &str = "block_actions";
const MESSAGE_ITEM: &str = "message";
/// The reaction that hands a message over (`:sheep:`).
pub const HAND_OVER_REACTION: &str = "sheep";
/// The word in a mention that hands its thread over ("@Shep tonight").
pub const HAND_OVER_WORD: &str = "tonight";

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Frame {
    Hello,
    /// Slack is about to drop this connection (`warning`, `refresh_requested`, …).
    Disconnect,
    /// An envelope to acknowledge, and what it means to Shep, if anything.
    Envelope {
        id: String,
        inbound: Option<Inbound>,
    },
    Other,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Inbound {
    HandOver(Handed),
    Merge(Press),
    /// Send back was pressed: the person is told how to send it back.
    SendBack(Press),
}

pub fn read(text: &str) -> Frame {
    let Ok(frame) = serde_json::from_str::<Value>(text) else {
        return Frame::Other;
    };
    let kind = frame["type"].as_str().unwrap_or_default();
    if let Some(id) = frame["envelope_id"].as_str() {
        let payload = &frame["payload"];
        let inbound = match kind {
            EVENTS_API => event(&payload["event"]),
            INTERACTIVE => press(payload),
            _ => None,
        };
        return Frame::Envelope {
            id: id.to_owned(),
            inbound,
        };
    }
    match kind {
        HELLO => Frame::Hello,
        DISCONNECT => Frame::Disconnect,
        _ => Frame::Other,
    }
}

fn event(event: &Value) -> Option<Inbound> {
    let text = |key: &str| event[key].as_str().map(str::to_owned);
    match event["type"].as_str()? {
        REACTION_ADDED => {
            let item = &event["item"];
            let handed = event["reaction"] == HAND_OVER_REACTION && item["type"] == MESSAGE_ITEM;
            handed.then(|| {
                Inbound::HandOver(Handed {
                    channel: item["channel"].as_str().unwrap_or_default().to_owned(),
                    ts: item["ts"].as_str().unwrap_or_default().to_owned(),
                })
            })
        }
        APP_MENTION if says_tonight(event["text"].as_str().unwrap_or_default()) => {
            Some(Inbound::HandOver(Handed {
                channel: text("channel")?,
                ts: text("thread_ts").or_else(|| text("ts"))?,
            }))
        }
        _ => None,
    }
    .filter(|inbound| !matches!(inbound, Inbound::HandOver(h) if h.channel.is_empty() || h.ts.is_empty()))
}

fn says_tonight(text: &str) -> bool {
    text.split(|c: char| !c.is_alphanumeric())
        .any(|word| word.eq_ignore_ascii_case(HAND_OVER_WORD))
}

fn press(payload: &Value) -> Option<Inbound> {
    if payload["type"] != BLOCK_ACTIONS {
        return None;
    }
    let user = payload["user"]["id"].as_str()?.to_owned();
    payload["actions"].as_array()?.iter().find_map(|action| {
        let (channel, thread_ts) = parse_thread_value(action["value"].as_str()?)?;
        let at = ts_seconds(action["action_ts"].as_str()?)?;
        let press = Press {
            channel,
            thread_ts,
            user: user.clone(),
            at,
        };
        match action["action_id"].as_str()? {
            MERGE_ACTION => Some(Inbound::Merge(press)),
            SEND_BACK_ACTION => Some(Inbound::SendBack(press)),
            _ => None,
        }
    })
}
