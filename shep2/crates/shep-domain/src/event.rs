use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

use crate::{TaskId, UnixTime};

/// What happened to a task, kept for the morning brief and the pull request's timeline.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub enum EventKind {
    WorktreeReady,
    AgentStarted,
    AgentFinished,
    Asked,
    Parked,
    Interrupted,
    StepFailed,
    PrOpened,
    Pushed,
    CiFailed,
    CiGreen,
    NoCi,
    Reviewed,
    Ready,
    Merged,
    // Plain comments below, not doc comments: documented variants would change the published
    // schema's shape for this enum (a `oneOf` instead of an `enum`).
    // The repository's screenshot command ran (or failed, or took too long).
    Screenshots,
    // The base branch moved and was merged into the task branch.
    BaseMerged,
    // The person sent the work back from GitHub with a `shep:` comment.
    SentBack,
    // The task was taken off the board, like when its issue was closed. Kept after the task.
    Stopped,
    // Work handed over in a source (a label, a status, a reaction) became this task.
    HandedOver,
    // Shep said where the task stands in its source: queued, a question, ready, merged.
    Reported,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub struct TaskEvent {
    pub task_id: TaskId,
    pub at: UnixTime,
    pub kind: EventKind,
    /// A sentence for a person, like "lint failed" or "parked until 06:10".
    pub detail: String,
}

/// One CI check on the task's pull request.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub struct CiCheck {
    pub name: String,
    pub state: CheckState,
    /// Where its log lives, when CI says.
    pub link: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub enum CheckState {
    Pending,
    Passed,
    Failed,
    Skipped,
}

/// What a set of checks adds up to.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum CiVerdict {
    /// No checks reported (yet).
    None,
    Pending,
    Green,
    /// The names of the failed checks.
    Red(Vec<String>),
}

impl CiVerdict {
    /// Any failure makes it red (no point waiting for the rest); otherwise anything still
    /// running keeps it pending.
    pub fn of(checks: &[CiCheck]) -> Self {
        let failed: Vec<String> = checks
            .iter()
            .filter(|c| c.state == CheckState::Failed)
            .map(|c| c.name.clone())
            .collect();
        if !failed.is_empty() {
            Self::Red(failed)
        } else if checks.is_empty() {
            Self::None
        } else if checks.iter().any(|c| c.state == CheckState::Pending) {
            Self::Pending
        } else {
            Self::Green
        }
    }
}
