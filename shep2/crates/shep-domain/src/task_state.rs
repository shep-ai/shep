use std::fmt;

use serde::{Deserialize, Serialize};

/// The five states every task moves through, on every surface.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum TaskState {
    Queued,
    Working,
    NeedsYou,
    Ready,
    Merged,
}

impl TaskState {
    pub const ALL: [TaskState; 5] = [
        Self::Queued,
        Self::Working,
        Self::NeedsYou,
        Self::Ready,
        Self::Merged,
    ];

    /// The lifecycle: start, ask or finish, resume after an answer or a send-back, merge.
    pub fn can_move_to(self, to: TaskState) -> bool {
        use TaskState::{Merged, NeedsYou, Queued, Ready, Working};
        matches!(
            (self, to),
            (Queued | NeedsYou | Ready, Working) | (Working, NeedsYou | Ready) | (Ready, Merged)
        )
    }

    pub fn label(self) -> &'static str {
        match self {
            Self::Queued => "Queued",
            Self::Working => "Working",
            Self::NeedsYou => "Needs you",
            Self::Ready => "Ready",
            Self::Merged => "Merged",
        }
    }
}

impl fmt::Display for TaskState {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(self.label())
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, thiserror::Error)]
#[error("a task cannot move from {from} to {to}")]
pub struct TransitionError {
    pub from: TaskState,
    pub to: TaskState,
}
