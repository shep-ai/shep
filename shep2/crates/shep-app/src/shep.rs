use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Mutex, MutexGuard};

use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use shep_domain::{
    AgentKind, ClockTime, PullRequest, Task, TaskId, TaskSourceRef, TaskState, TransitionError,
    UnixTime,
};

use crate::{AppError, Board, Ports};

/// When `start` should begin queued work.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub enum StartWhen {
    Now,
    At(ClockTime),
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub enum StartOutcome {
    /// Tasks that moved to Working now (empty when the parallel limit is already reached).
    Started(Vec<Task>),
    /// The shift will start at this time with this many tasks waiting.
    Scheduled { at: ClockTime, queued: usize },
}

/// A partial settings update; `None` keeps the current value.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub struct SettingsChange {
    #[serde(default)]
    pub agent: Option<AgentKind>,
    #[serde(default)]
    pub shift_start: Option<ClockTime>,
    #[serde(default)]
    pub parallelism: Option<u8>,
    /// The local checkout Shep works in.
    #[serde(default)]
    pub repo: Option<String>,
    #[serde(default)]
    pub nightly: Option<bool>,
    #[serde(default)]
    pub keep_awake: Option<bool>,
}

impl SettingsChange {
    pub fn is_empty(&self) -> bool {
        *self == Self::default()
    }
}

/// The four core actions, plus what the engine reports back (`finish`, `ask`, …).
///
/// Every change to a task is read, changed and saved under one lock, so the daemon's request
/// threads and its engine never overwrite each other's work.
pub struct Shep {
    ports: Ports,
    writes: Mutex<()>,
    /// While a shift is open, free slots fill from the queue.
    shift_open: AtomicBool,
}

impl Shep {
    pub fn new(ports: Ports) -> Self {
        Self {
            ports,
            writes: Mutex::new(()),
            shift_open: AtomicBool::new(false),
        }
    }

    pub(crate) fn ports(&self) -> &Ports {
        &self.ports
    }

    pub(crate) fn board_now(&self) -> Result<Board, AppError> {
        Ok(Board::from_tasks(self.ports.tasks.list()?))
    }

    /// The task already on the board for this source, unless it was merged.
    pub(crate) fn open_task_for(&self, source: &TaskSourceRef) -> Result<Option<Task>, AppError> {
        Ok(self
            .ports
            .tasks
            .list()?
            .into_iter()
            .find(|t| t.source == *source && t.state != TaskState::Merged))
    }

    /// The engine reports a task's pull request is ready for review.
    pub fn finish(&self, id: TaskId) -> Result<Task, AppError> {
        self.update(id, |task, now| task.move_to(TaskState::Ready, now))
    }

    /// The engine reports the agent (or Shep) is waiting on a person.
    pub fn ask(&self, id: TaskId, question: &str) -> Result<Task, AppError> {
        self.update(id, |task, now| task.ask(question, now))
    }

    /// The source gave the task a better title than the reference it was added with.
    pub fn retitle(&self, id: TaskId, title: &str) -> Result<Task, AppError> {
        self.update(id, |task, now| {
            title.clone_into(&mut task.title);
            task.updated_at = now;
            Ok(())
        })
    }

    /// The engine opened the task's draft pull request.
    pub fn set_pr(&self, id: TaskId, pr: PullRequest) -> Result<Task, AppError> {
        self.update(id, |task, now| {
            task.pr = Some(pr);
            task.updated_at = now;
            Ok(())
        })
    }

    pub fn shift_open(&self) -> bool {
        self.shift_open.load(Ordering::SeqCst)
    }

    pub fn open_shift(&self) {
        self.shift_open.store(true, Ordering::SeqCst);
    }

    pub fn close_shift(&self) {
        self.shift_open.store(false, Ordering::SeqCst);
    }

    /// Starts queued tasks, oldest first, into the free parallel slots.
    pub fn start_queued(&self) -> Result<Vec<Task>, AppError> {
        let _guard = self.lock()?;
        let board = Board::from_tasks(self.ports.tasks.list()?);
        let limit = usize::from(self.ports.settings.load_settings()?.parallelism);
        let free = limit.saturating_sub(board.working.len());
        board
            .queued
            .into_iter()
            .take(free)
            .map(|mut task| {
                task.move_to(TaskState::Working, self.ports.clock.now())?;
                self.ports.tasks.save(&task)?;
                Ok(task)
            })
            .collect()
    }

    pub(crate) fn lock(&self) -> Result<MutexGuard<'_, ()>, AppError> {
        self.writes
            .lock()
            .map_err(|_| AppError::Remote("an earlier change crashed; restart Shep".into()))
    }

    pub(crate) fn update(
        &self,
        id: TaskId,
        change: impl FnOnce(&mut Task, UnixTime) -> Result<(), TransitionError>,
    ) -> Result<Task, AppError> {
        let _guard = self.lock()?;
        let mut task = self.ports.tasks.get(id)?.ok_or(AppError::NotFound(id))?;
        change(&mut task, self.ports.clock.now())?;
        self.ports.tasks.save(&task)?;
        Ok(task)
    }
}
