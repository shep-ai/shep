//! What the tools hand back: small, flat JSON an agent can read and repeat to a person.

use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use shep_app::Board;
use shep_domain::{Task, TaskState};

/// One task, as an agent should mention it.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct TaskLine {
    /// Pass this to `review`.
    pub id: i64,
    /// Where it came from: `#412`, `ENG-88`, a link, or the sentence.
    pub reference: String,
    pub title: String,
    pub state: TaskState,
    /// The draft pull request, once there is one.
    pub pr: Option<String>,
    /// What the agent is asking, while the task needs you.
    pub question: Option<String>,
}

impl From<&Task> for TaskLine {
    fn from(t: &Task) -> Self {
        Self {
            id: t.id.0,
            reference: t.source.to_string(),
            title: t.title.clone(),
            state: t.state,
            pr: t.pr.as_ref().map(|pr| pr.url.clone()),
            question: t.question.clone(),
        }
    }
}

/// A task that was just added.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct Added {
    #[serde(flatten)]
    pub task: TaskLine,
    /// `now`, the time the shift starts (`23:00`), or null when it waits for `shep go`.
    pub starts: Option<String>,
}

/// How many tasks are in each state, and the open ones in review order.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct BoardAnswer {
    pub ready: usize,
    pub needs_you: usize,
    pub working: usize,
    pub queued: usize,
    /// Needs you first, then Ready, Working and Queued. Merged tasks are left out.
    pub tasks: Vec<TaskLine>,
}

impl From<&Board> for BoardAnswer {
    fn from(b: &Board) -> Self {
        Self {
            ready: b.ready.len(),
            needs_you: b.needs_you.len(),
            working: b.working.len(),
            queued: b.queued.len(),
            tasks: b
                .groups()
                .filter(|(state, _)| *state != TaskState::Merged)
                .flat_map(|(_, tasks)| tasks.iter().map(TaskLine::from))
                .collect(),
        }
    }
}
