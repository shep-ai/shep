use std::sync::{Mutex, MutexGuard};

use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use shep_domain::{
    AgentKind, ClockTime, ReviewAction, Settings, Task, TaskId, TaskSourceRef, TaskState,
    TransitionError, UnixTime,
};

use crate::{AppError, Board, Ports, ShepApi};

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
}

impl SettingsChange {
    pub fn is_empty(&self) -> bool {
        *self == Self::default()
    }
}

/// The four core actions, plus the events the engine reports back (`finish`, `ask`).
///
/// Every change to a task is read, changed and saved under one lock, so the daemon's request
/// threads and its engine never overwrite each other's work.
pub struct Shep {
    ports: Ports,
    writes: Mutex<()>,
}

impl Shep {
    pub fn new(ports: Ports) -> Self {
        Self {
            ports,
            writes: Mutex::new(()),
        }
    }

    /// The engine reports a task's pull request is ready for review.
    pub fn finish(&self, id: TaskId) -> Result<Task, AppError> {
        self.update(id, |task, now| task.move_to(TaskState::Ready, now))
    }

    /// The engine reports the agent is waiting on a question.
    pub fn ask(&self, id: TaskId, question: &str) -> Result<Task, AppError> {
        self.update(id, |task, now| task.ask(question, now))
    }

    fn lock(&self) -> Result<MutexGuard<'_, ()>, AppError> {
        self.writes
            .lock()
            .map_err(|_| AppError::Remote("an earlier change crashed; restart Shep".into()))
    }

    fn update(
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

    fn start_now(&self) -> Result<Vec<Task>, AppError> {
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
}

impl ShepApi for Shep {
    fn add(&self, input: &str) -> Result<Task, AppError> {
        let source = TaskSourceRef::parse(input)?;
        let _guard = self.lock()?;
        Ok(self.ports.tasks.create(source, self.ports.clock.now())?)
    }

    /// Starts queued tasks now (oldest first, up to the parallel limit) or sets the shift time.
    fn start(&self, when: StartWhen) -> Result<StartOutcome, AppError> {
        match when {
            StartWhen::At(at) => {
                self.update_settings(SettingsChange {
                    shift_start: Some(at),
                    ..SettingsChange::default()
                })?;
                Ok(StartOutcome::Scheduled {
                    at,
                    queued: self.board()?.queued.len(),
                })
            }
            StartWhen::Now => Ok(StartOutcome::Started(self.start_now()?)),
        }
    }

    fn board(&self) -> Result<Board, AppError> {
        Ok(Board::from_tasks(self.ports.tasks.list()?))
    }

    fn review(&self, id: TaskId, action: ReviewAction) -> Result<Task, AppError> {
        self.update(id, |task, now| task.review(action, now))
    }

    fn settings(&self) -> Result<Settings, AppError> {
        Ok(self.ports.settings.load_settings()?)
    }

    fn update_settings(&self, change: SettingsChange) -> Result<Settings, AppError> {
        let _guard = self.lock()?;
        let mut settings = self.ports.settings.load_settings()?;
        if let Some(agent) = change.agent {
            settings.agent = Some(agent);
        }
        if let Some(at) = change.shift_start {
            settings.shift_start = at;
        }
        if let Some(n) = change.parallelism {
            settings.parallelism = Settings::check_parallelism(n)?;
        }
        if let Some(repo) = change.repo {
            settings.repo = Some(repo);
        }
        self.ports.settings.save_settings(&settings)?;
        Ok(settings)
    }
}
