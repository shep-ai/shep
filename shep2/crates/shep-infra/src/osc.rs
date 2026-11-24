//! OSC 7501, the Program Status Protocol: how a program in a terminal reports its state.
//!
//! Wire format (spec rev 0.4): `ESC ] 7501 ; key=value:key=value ST`, where ST is `ESC \` or
//! BEL. `state` (idle, working, done, blocked, error, clear) is required; `kind` (permission,
//! question, auth) qualifies `blocked`; `msg` is base64 UTF-8; `id` names a child record.
//! Written from the spec; Shep reads only the root record. herdr consumes the same protocol,
//! so an agent that reports to herdr also reports to Shep.

use base64::engine::general_purpose::STANDARD_NO_PAD;
use base64::Engine as _;
use shep_domain::{AgentStatus, BlockKind};

const ESC: u8 = 0x1b;
const BEL: u8 = 0x07;
const OSC_INTRO: u8 = b']';
const ST_FINAL: u8 = b'\\';
const PREFIX: &[u8] = b"7501;";
/// The longest sequence the protocol allows; anything longer is dropped whole.
const MAX_SEQUENCE: usize = 4096;
const PAD: char = '=';

/// What one report says.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Report {
    Status(AgentStatus),
    /// The program withdrew its status.
    Clear,
}

#[derive(Debug, Default, Clone, Copy, PartialEq, Eq)]
enum State {
    #[default]
    Ground,
    Escape,
    Osc,
    OscEscape,
    /// Inside a sequence too long to keep; waiting for its end.
    Overflow,
    OverflowEscape,
}

/// Finds OSC 7501 reports in a terminal byte stream, across reads.
#[derive(Debug, Default)]
pub struct OscScanner {
    state: State,
    body: Vec<u8>,
}

impl OscScanner {
    pub fn feed(&mut self, bytes: &[u8]) -> Vec<Report> {
        let mut reports = Vec::new();
        for &b in bytes {
            self.state = match (self.state, b) {
                (State::Ground | State::Escape, ESC) => State::Escape,
                // A new OSC starts; inside one, any other escape ends it without a report.
                (State::Escape | State::OscEscape, OSC_INTRO) => {
                    self.body.clear();
                    State::Osc
                }
                (State::Osc, BEL) | (State::OscEscape, ST_FINAL) => {
                    reports.extend(self.finish());
                    State::Ground
                }
                (State::Osc, ESC) => State::OscEscape,
                (State::Osc, _) if self.body.len() >= MAX_SEQUENCE => {
                    self.body.clear();
                    State::Overflow
                }
                (State::Osc, _) => {
                    self.body.push(b);
                    State::Osc
                }
                (State::Overflow | State::OverflowEscape, ESC) => State::OverflowEscape,
                (State::Overflow | State::OverflowEscape, BEL)
                | (State::OverflowEscape, ST_FINAL)
                | (State::Ground | State::Escape | State::OscEscape, _) => State::Ground,
                (State::Overflow | State::OverflowEscape, _) => State::Overflow,
            };
        }
        reports
    }

    fn finish(&mut self) -> Option<Report> {
        let body = std::mem::take(&mut self.body);
        let rest = body.strip_prefix(PREFIX)?;
        parse(std::str::from_utf8(rest).ok()?)
    }
}

fn allowed_value(v: &str) -> bool {
    v.bytes()
        .all(|b| b.is_ascii_alphanumeric() || b"_.+-,/=".contains(&b))
}

/// Reads one report's body. Anything malformed drops the whole report, as the spec says.
fn parse(body: &str) -> Option<Report> {
    let mut state = None;
    let mut kind = None;
    let mut message = None;
    for pair in body.split(':') {
        let (key, value) = pair.split_once('=')?;
        if !allowed_value(value) {
            return None;
        }
        match key {
            "state" => state = Some(value),
            "kind" => kind = Some(value),
            "msg" => message = Some(decode(value)?),
            // A child record (a sub-task the program reports); Shep reads the root only.
            "id" => return None,
            _ => {}
        }
    }
    let status = match state? {
        "idle" => AgentStatus::Idle,
        "working" => AgentStatus::Working,
        "done" => AgentStatus::Done,
        "blocked" => AgentStatus::Blocked {
            kind: kind.and_then(block_kind),
            message,
        },
        "error" => AgentStatus::Error { message },
        "clear" => return Some(Report::Clear),
        _ => return None,
    };
    Some(Report::Status(status))
}

fn block_kind(kind: &str) -> Option<BlockKind> {
    match kind {
        "permission" => Some(BlockKind::Permission),
        "question" => Some(BlockKind::Question),
        "auth" => Some(BlockKind::Auth),
        _ => None,
    }
}

/// Base64 with or without padding, to UTF-8 text without control characters.
fn decode(value: &str) -> Option<String> {
    let bytes = STANDARD_NO_PAD.decode(value.trim_end_matches(PAD)).ok()?;
    let text = String::from_utf8(bytes).ok()?;
    (!text.chars().any(char::is_control)).then_some(text)
}
