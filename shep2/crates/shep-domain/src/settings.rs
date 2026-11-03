use std::fmt;

use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

/// The coding agents Shep can run. Which one runs is a setting, never hardcoded.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize, JsonSchema)]
pub enum AgentKind {
    ClaudeCode,
    Codex,
    Gemini,
}

impl AgentKind {
    pub const ALL: [AgentKind; 3] = [Self::ClaudeCode, Self::Codex, Self::Gemini];

    pub fn parse(s: &str) -> Result<Self, SettingsError> {
        Self::ALL
            .into_iter()
            .find(|a| a.cli_name() == s.trim())
            .ok_or_else(|| SettingsError::UnknownAgent(s.to_owned()))
    }

    /// The name used on the command line and in config.
    pub fn cli_name(self) -> &'static str {
        match self {
            Self::ClaudeCode => "claude-code",
            Self::Codex => "codex",
            Self::Gemini => "gemini",
        }
    }
}

/// A time of day, like the shift start.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub struct ClockTime {
    pub hour: u8,
    pub minute: u8,
}

const HOURS_PER_DAY: u8 = 24;
const MINUTES_PER_HOUR: u8 = 60;

impl ClockTime {
    pub fn parse(s: &str) -> Result<Self, SettingsError> {
        let bad = || SettingsError::BadTime(s.to_owned());
        let (h, m) = s.trim().split_once(':').ok_or_else(bad)?;
        let (hour, minute): (u8, u8) =
            (h.parse().map_err(|_| bad())?, m.parse().map_err(|_| bad())?);
        if hour >= HOURS_PER_DAY || minute >= MINUTES_PER_HOUR || m.len() != 2 {
            return Err(bad());
        }
        Ok(Self { hour, minute })
    }
}

impl fmt::Display for ClockTime {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{:02}:{:02}", self.hour, self.minute)
    }
}

pub const DEFAULT_SHIFT_START: ClockTime = ClockTime {
    hour: 23,
    minute: 0,
};
pub const DEFAULT_PARALLELISM: u8 = 3;
pub const MAX_PARALLELISM: u8 = 12;

/// What `shep config` sets.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub struct Settings {
    /// `None` until onboarding picks one (or Shep detects one).
    pub agent: Option<AgentKind>,
    pub shift_start: ClockTime,
    /// How many tasks run at once.
    pub parallelism: u8,
    /// The local checkout Shep works in. Every task gets its own worktree from its `origin`;
    /// the checkout itself is never touched. `None` until the first `shep add` inside a
    /// repository or `shep config --repo`.
    #[serde(default)]
    pub repo: Option<String>,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            agent: None,
            shift_start: DEFAULT_SHIFT_START,
            parallelism: DEFAULT_PARALLELISM,
            repo: None,
        }
    }
}

impl Settings {
    pub fn check_parallelism(n: u8) -> Result<u8, SettingsError> {
        if (1..=MAX_PARALLELISM).contains(&n) {
            Ok(n)
        } else {
            Err(SettingsError::BadParallelism(n))
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, thiserror::Error)]
pub enum SettingsError {
    #[error("{0:?} is not a time; use HH:MM, like 23:00")]
    BadTime(String),
    #[error("unknown agent {0:?}; use claude-code, codex or gemini")]
    UnknownAgent(String),
    #[error("run between 1 and 12 tasks at a time, not {0}")]
    BadParallelism(u8),
}
