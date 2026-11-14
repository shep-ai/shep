use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use shep_app::{SettingsChange, StartWhen};
use shep_domain::{ReviewAction, TaskId};

/// Every call the daemon answers. Adding one is fine; removing or renaming one breaks clients
/// (the schema test refuses it).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Method {
    Add,
    Start,
    Board,
    Review,
    SettingsGet,
    SettingsUpdate,
    /// Answers with the current board, then pushes [`crate::BOARD_CHANGED`] on every change.
    Subscribe,
    Detail,
    Brief,
    MorningBrief,
    FirstRunToday,
    AddLabel,
    /// Answers with the agent's screen, then pushes [`crate::AGENT_OUTPUT`] as it prints.
    WatchAgent,
    SendToAgent,
}

impl Method {
    pub const ALL: [Method; 14] = [
        Self::Add,
        Self::Start,
        Self::Board,
        Self::Review,
        Self::SettingsGet,
        Self::SettingsUpdate,
        Self::Subscribe,
        Self::Detail,
        Self::Brief,
        Self::MorningBrief,
        Self::FirstRunToday,
        Self::AddLabel,
        Self::WatchAgent,
        Self::SendToAgent,
    ];

    pub fn name(self) -> &'static str {
        match self {
            Self::Add => "add",
            Self::Start => "start",
            Self::Board => "board",
            Self::Review => "review",
            Self::SettingsGet => "settings.get",
            Self::SettingsUpdate => "settings.update",
            Self::Subscribe => "board.subscribe",
            Self::Detail => "task.detail",
            Self::Brief => "brief",
            Self::MorningBrief => "brief.morning",
            Self::FirstRunToday => "day.first_run",
            Self::AddLabel => "add.label",
            Self::WatchAgent => "agent.watch",
            Self::SendToAgent => "agent.send",
        }
    }

    pub fn parse(name: &str) -> Option<Self> {
        Self::ALL.into_iter().find(|m| m.name() == name)
    }

    pub fn summary(self) -> &'static str {
        match self {
            Self::Add => "Queue a task from an issue reference, a link, or a sentence.",
            Self::Start => "Start queued tasks now, or set when tonight's shift starts.",
            Self::Board => "Every task, grouped by state in review order.",
            Self::Review => "A person's decision: merge, send back with a note, or answer.",
            Self::SettingsGet => "The current settings.",
            Self::SettingsUpdate => "Change some settings; fields left out keep their value.",
            Self::Subscribe => "The board now, then a board.changed notification on every change.",
            Self::Detail => "One task in full: its run, what it is doing, CI, diff, proof, review.",
            Self::Brief => "What finished, what needs you, and how the night went.",
            Self::MorningBrief => "The brief once per morning; null when nothing is new.",
            Self::FirstRunToday => "True the first time it is asked on a new local day.",
            Self::AddLabel => "Queue every open issue with this label that is not on the board.",
            Self::WatchAgent => "The agent's screen now, then agent.output notifications.",
            Self::SendToAgent => "Type into the task's agent.",
        }
    }
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub struct NoParams {}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub struct AddParams {
    /// `#412`, `owner/repo#412`, a link to a ticket or message, or a sentence.
    pub input: String,
    /// Where the person was when they added it; the first time, Shep works in that repository.
    #[serde(default)]
    pub from_dir: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub struct StartParams {
    pub when: StartWhen,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub struct ReviewParams {
    pub id: TaskId,
    pub action: ReviewAction,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub struct UpdateSettingsParams {
    pub change: SettingsChange,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub struct IdParams {
    pub id: TaskId,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub struct AddLabelParams {
    pub label: String,
    #[serde(default)]
    pub from_dir: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub struct SendParams {
    pub id: TaskId,
    /// Base64 bytes to type.
    pub data: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub struct WatchReply {
    /// Base64 bytes that redraw the agent's screen.
    pub screen: String,
}

/// Pushed after `agent.watch`: bytes the agent printed.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub struct AgentOutput {
    pub id: TaskId,
    /// Base64 bytes.
    pub data: String,
}
