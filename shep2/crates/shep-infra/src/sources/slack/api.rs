//! Slack's Web API over [`Http`]: one token per client, `ok: false` read as an error that names
//! the method and Slack's error code, never the token.

use std::fmt::Write as _;

use serde_json::Value;
use shep_app::ports::SourceError;

use crate::sources::http::{Http, Verb};

pub const AUTH_TEST: &str = "auth.test";
pub const CONNECTIONS_OPEN: &str = "apps.connections.open";
pub const POST_MESSAGE: &str = "chat.postMessage";
pub const POST_EPHEMERAL: &str = "chat.postEphemeral";
pub const GET_PERMALINK: &str = "chat.getPermalink";
pub const REPLIES: &str = "conversations.replies";
pub const HISTORY: &str = "conversations.history";
pub const MEMBER_OF: &str = "users.conversations";
pub const UPLOAD_URL: &str = "files.getUploadURLExternal";
pub const COMPLETE_UPLOAD: &str = "files.completeUploadExternal";

/// Slack's errors for a message or thread that is gone.
pub const GONE: [&str; 3] = ["thread_not_found", "message_not_found", "channel_not_found"];

const AUTHORIZATION: &str = "Authorization";
const BEARER: &str = "Bearer";
const CONTENT_TYPE: &str = "Content-Type";
const FORM: &str = "application/x-www-form-urlencoded";
const OK: &str = "ok";
const ERROR: &str = "error";
const UNKNOWN_ERROR: &str = "an unknown error";

/// Who a bot token belongs to (`auth.test`).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Identity {
    /// The workspace's name, like "Acme".
    pub team: String,
    /// The bot user's id: Shep's own messages carry it.
    pub user_id: String,
    pub bot_id: String,
}

/// A refusal from Slack itself (`ok: false`), apart from not reaching it.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Failure {
    Refused { method: String, code: String },
    Unreachable(SourceError),
}

impl Failure {
    pub fn is_gone(&self) -> bool {
        matches!(self, Self::Refused { code, .. } if GONE.contains(&code.as_str()))
    }
}

impl From<Failure> for SourceError {
    fn from(failure: Failure) -> Self {
        match failure {
            Failure::Refused { method, code } => {
                SourceError(format!("Slack refused {method}: {code}"))
            }
            Failure::Unreachable(e) => e,
        }
    }
}

#[derive(Clone)]
pub struct Api {
    http: Http,
    bearer: String,
}

impl Api {
    pub fn new(base: &str, token: &str) -> Self {
        Self {
            http: Http::new(base),
            bearer: format!("{BEARER} {token}"),
        }
    }

    /// A read method, its arguments in the query.
    pub fn get(&self, method: &str, args: &[(&str, &str)]) -> Result<Value, Failure> {
        let path = format!("{method}?{}", form(args));
        let answer = self
            .http
            .get(&path, &[(AUTHORIZATION, &self.bearer)])
            .map_err(Failure::Unreachable)?;
        checked(method, answer)
    }

    /// A write method that takes JSON.
    pub fn post(&self, method: &str, body: &Value) -> Result<Value, Failure> {
        let answer = self
            .http
            .post(method, &[(AUTHORIZATION, &self.bearer)], body)
            .map_err(Failure::Unreachable)?;
        checked(method, answer)
    }

    /// A write method that takes only form fields.
    pub fn post_form(&self, method: &str, args: &[(&str, &str)]) -> Result<Value, Failure> {
        let headers = [(AUTHORIZATION, self.bearer.as_str()), (CONTENT_TYPE, FORM)];
        let body = form(args);
        let raw = self
            .http
            .send(Verb::Post, method, &headers, Some(body.as_bytes()))
            .map_err(Failure::Unreachable)?;
        let answer = serde_json::from_str(&raw).map_err(|e| {
            Failure::Unreachable(SourceError(format!("Slack answered {method} oddly: {e}")))
        })?;
        checked(method, answer)
    }

    /// Sends a file's bytes to an upload URL Slack handed out; the token is not sent there.
    pub fn upload(&self, url: &str, bytes: &[u8]) -> Result<(), SourceError> {
        self.http.send(Verb::Post, url, &[], Some(bytes)).map(drop)
    }

    pub fn identity(&self) -> Result<Identity, Failure> {
        let me = self.post_form(AUTH_TEST, &[])?;
        let text = |key: &str| me[key].as_str().unwrap_or_default().to_owned();
        Ok(Identity {
            team: text("team"),
            user_id: text("user_id"),
            bot_id: text("bot_id"),
        })
    }
}

fn checked(method: &str, answer: Value) -> Result<Value, Failure> {
    if answer[OK].as_bool() == Some(true) {
        return Ok(answer);
    }
    Err(Failure::Refused {
        method: method.to_owned(),
        code: answer[ERROR].as_str().unwrap_or(UNKNOWN_ERROR).to_owned(),
    })
}

/// `a=1&b=two%20words`.
fn form(args: &[(&str, &str)]) -> String {
    args.iter()
        .map(|(k, v)| format!("{k}={}", encode(v)))
        .collect::<Vec<_>>()
        .join("&")
}

fn encode(value: &str) -> String {
    let mut out = String::with_capacity(value.len());
    for byte in value.bytes() {
        if byte.is_ascii_alphanumeric() || b"-._~".contains(&byte) {
            out.push(char::from(byte));
        } else {
            let _ = write!(out, "%{byte:02X}");
        }
    }
    out
}
