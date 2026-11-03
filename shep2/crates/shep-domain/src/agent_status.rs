use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

use crate::{ClockTime, UnixTime};

/// What a running agent is doing, as it reports over OSC 7501 or as its screen shows.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub enum AgentStatus {
    Working,
    Idle,
    Done,
    /// Waiting on a person: a permission prompt, a question, a sign-in.
    Blocked {
        kind: Option<BlockKind>,
        message: Option<String>,
    },
    Error {
        message: Option<String>,
    },
    /// The plan's usage limit is reached; the agent can go on after the reset.
    UsageLimit {
        resets: ResetAt,
    },
}

impl AgentStatus {
    pub fn is_usage_limit(&self) -> bool {
        matches!(self, Self::UsageLimit { .. })
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub enum BlockKind {
    Permission,
    Question,
    Auth,
}

/// When a usage limit lifts, as precisely as the agent said.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub enum ResetAt {
    Unknown,
    At(UnixTime),
    /// The next time the local clock shows this time.
    TimeOfDay(ClockTime),
    /// This many seconds from now.
    InSeconds(i64),
}
