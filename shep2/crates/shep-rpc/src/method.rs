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
}

impl Method {
    pub const ALL: [Method; 7] = [
        Self::Add,
        Self::Start,
        Self::Board,
        Self::Review,
        Self::SettingsGet,
        Self::SettingsUpdate,
        Self::Subscribe,
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
        }
    }
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub struct NoParams {}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub struct AddParams {
    /// `#412`, `owner/repo#412`, a link to a ticket or message, or a sentence.
    pub input: String,
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
