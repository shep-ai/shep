use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

use crate::{TaskSourceRef, TaskState, TransitionError};

#[derive(
    Debug, Clone, Copy, PartialEq, Eq, Hash, PartialOrd, Ord, Serialize, Deserialize, JsonSchema,
)]
pub struct TaskId(pub i64);

impl std::fmt::Display for TaskId {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.0)
    }
}

/// Seconds since the Unix epoch.
#[derive(
    Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize, JsonSchema,
)]
pub struct UnixTime(pub i64);

/// The draft pull request Shep opened for a task.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub struct PullRequest {
    pub number: u64,
    pub url: String,
}

impl std::fmt::Display for PullRequest {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(&self.url)
    }
}

/// The decisions a person makes on a task.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub enum ReviewAction {
    Merge,
    SendBack { note: String },
    Answer { text: String },
}

/// The one thing in Shep: work handed over by a person.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub struct Task {
    pub id: TaskId,
    pub title: String,
    pub source: TaskSourceRef,
    pub state: TaskState,
    /// The question the agent is waiting on while the task needs you.
    pub question: Option<String>,
    /// The latest instruction from the person: an answer or a send-back note.
    pub note: Option<String>,
    /// The draft pull request, once Shep has opened one.
    #[serde(default)]
    pub pr: Option<PullRequest>,
    pub created_at: UnixTime,
    pub updated_at: UnixTime,
}

impl Task {
    pub fn new(id: TaskId, source: TaskSourceRef, now: UnixTime) -> Self {
        Self {
            id,
            title: source.to_string(),
            source,
            state: TaskState::Queued,
            question: None,
            note: None,
            pr: None,
            created_at: now,
            updated_at: now,
        }
    }

    pub fn move_to(&mut self, to: TaskState, now: UnixTime) -> Result<(), TransitionError> {
        if !self.state.can_move_to(to) {
            return Err(TransitionError {
                from: self.state,
                to,
            });
        }
        self.state = to;
        self.updated_at = now;
        Ok(())
    }

    pub fn ask(&mut self, question: &str, now: UnixTime) -> Result<(), TransitionError> {
        self.move_to(TaskState::NeedsYou, now)?;
        self.question = Some(question.to_owned());
        Ok(())
    }

    pub fn review(&mut self, action: ReviewAction, now: UnixTime) -> Result<(), TransitionError> {
        let refuse = |from, to| Err(TransitionError { from, to });
        match (action, self.state) {
            (ReviewAction::Merge, TaskState::Ready) => self.move_to(TaskState::Merged, now),
            (ReviewAction::SendBack { note }, TaskState::Ready) => {
                self.move_to(TaskState::Working, now)?;
                self.note = Some(note);
                Ok(())
            }
            (ReviewAction::Answer { text }, TaskState::NeedsYou) => {
                self.move_to(TaskState::Working, now)?;
                self.question = None;
                self.note = Some(text);
                Ok(())
            }
            (ReviewAction::Merge, from) => refuse(from, TaskState::Merged),
            (ReviewAction::SendBack { .. } | ReviewAction::Answer { .. }, from) => {
                refuse(from, TaskState::Working)
            }
        }
    }
}
