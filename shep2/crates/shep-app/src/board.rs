use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use shep_domain::{Task, TaskState};

/// Every task, grouped by state in the order a person reviews them.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub struct Board {
    pub needs_you: Vec<Task>,
    pub ready: Vec<Task>,
    pub working: Vec<Task>,
    pub queued: Vec<Task>,
    pub merged: Vec<Task>,
}

impl Board {
    /// Needs you and Ready show the newest first; Queued shows the order work will start in.
    pub fn from_tasks(tasks: Vec<Task>) -> Self {
        let mut board = Self::default();
        for task in tasks {
            board.group_mut(task.state).push(task);
        }
        for group in [
            &mut board.needs_you,
            &mut board.ready,
            &mut board.working,
            &mut board.merged,
        ] {
            group.sort_by(|a, b| b.updated_at.cmp(&a.updated_at).then(a.id.cmp(&b.id)));
        }
        board.queued.sort_by_key(|t| (t.created_at, t.id));
        board
    }

    pub fn groups(&self) -> impl Iterator<Item = (TaskState, &Vec<Task>)> {
        [
            (TaskState::NeedsYou, &self.needs_you),
            (TaskState::Ready, &self.ready),
            (TaskState::Working, &self.working),
            (TaskState::Queued, &self.queued),
            (TaskState::Merged, &self.merged),
        ]
        .into_iter()
    }

    fn group_mut(&mut self, state: TaskState) -> &mut Vec<Task> {
        match state {
            TaskState::NeedsYou => &mut self.needs_you,
            TaskState::Ready => &mut self.ready,
            TaskState::Working => &mut self.working,
            TaskState::Queued => &mut self.queued,
            TaskState::Merged => &mut self.merged,
        }
    }
}
