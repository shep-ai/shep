//! The holder's own JSON-RPC methods. Internal to Shep: only the daemon and attach use it.

use serde::{Deserialize, Serialize};
use shep_domain::AgentStatus;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum HolderMethod {
    Spawn,
    Poll,
    Kill,
    Write,
    Attach,
}

impl HolderMethod {
    pub const ALL: [HolderMethod; 5] = [
        Self::Spawn,
        Self::Poll,
        Self::Kill,
        Self::Write,
        Self::Attach,
    ];

    pub fn name(self) -> &'static str {
        match self {
            Self::Spawn => "spawn",
            Self::Poll => "poll",
            Self::Kill => "kill",
            Self::Write => "write",
            Self::Attach => "attach",
        }
    }

    pub fn parse(name: &str) -> Option<Self> {
        Self::ALL.into_iter().find(|m| m.name() == name)
    }
}

/// Pushed to attached clients: bytes the session printed (base64).
pub const OUTPUT: &str = "output";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SpawnParams {
    pub program: String,
    pub args: Vec<String>,
    pub cwd: String,
    pub env: Vec<(String, String)>,
    pub log: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IdParams {
    pub id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WriteParams {
    pub id: String,
    /// Base64 bytes to type into the session.
    pub data: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OutputParams {
    pub id: String,
    pub data: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AttachReply {
    /// Base64 bytes that redraw the session's current screen.
    pub screen: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum PollReply {
    Running {
        status: Option<AgentStatus>,
        screen: String,
    },
    Exited {
        code: Option<i32>,
        status: Option<AgentStatus>,
        screen: String,
    },
    Unknown,
}
