use shep_domain::{
    AgentKind, ClockTime, ReviewAction, Settings, Task, TaskId, TaskSourceRef, TaskState,
};

use crate::{AppError, Board, Clock, SettingsRepository, TaskRepository};

/// When `start` should begin queued work.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum StartWhen {
    Now,
    At(ClockTime),
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum StartOutcome {
    /// Tasks that moved to Working now (empty when the parallel limit is already reached).
    Started(Vec<Task>),
    /// The shift will start at this time with this many tasks waiting.
    Scheduled { at: ClockTime, queued: usize },
}

/// A partial settings update; `None` keeps the current value.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub struct SettingsChange {
    pub agent: Option<AgentKind>,
    pub shift_start: Option<ClockTime>,
    pub parallelism: Option<u8>,
}

/// The four core actions, plus the events the engine reports back (`finish`, `ask`).
pub struct Shep<T, S, C> {
    tasks: T,
    settings: S,
    clock: C,
}

impl<T: TaskRepository, S: SettingsRepository, C: Clock> Shep<T, S, C> {
    pub fn new(tasks: T, settings: S, clock: C) -> Self {
        Self {
            tasks,
            settings,
            clock,
        }
    }

    /// Queues a task from an issue reference, a link, or a sentence.
    pub fn add(&self, input: &str) -> Result<Task, AppError> {
        let source = TaskSourceRef::parse(input)?;
        Ok(self.tasks.create(source, self.clock.now())?)
    }

    /// Starts queued tasks now (oldest first, up to the parallel limit) or sets the shift time.
    pub fn start(&self, when: StartWhen) -> Result<StartOutcome, AppError> {
        let board = self.board()?;
        match when {
            StartWhen::At(at) => {
                self.update_settings(SettingsChange {
                    shift_start: Some(at),
                    ..SettingsChange::default()
                })?;
                Ok(StartOutcome::Scheduled {
                    at,
                    queued: board.queued.len(),
                })
            }
            StartWhen::Now => {
                let limit = usize::from(self.settings.load_settings()?.parallelism);
                let free = limit.saturating_sub(board.working.len());
                let started = board
                    .queued
                    .into_iter()
                    .take(free)
                    .map(|mut task| {
                        task.move_to(TaskState::Working, self.clock.now())?;
                        self.tasks.save(&task)?;
                        Ok(task)
                    })
                    .collect::<Result<Vec<_>, AppError>>()?;
                Ok(StartOutcome::Started(started))
            }
        }
    }

    pub fn board(&self) -> Result<Board, AppError> {
        Ok(Board::from_tasks(self.tasks.list()?))
    }

    /// A person's decision: merge, send back with a note, or answer a question.
    pub fn review(&self, id: TaskId, action: ReviewAction) -> Result<Task, AppError> {
        self.update(id, |task, now| task.review(action, now))
    }

    /// The engine reports a task's pull request is ready for review.
    pub fn finish(&self, id: TaskId) -> Result<Task, AppError> {
        self.update(id, |task, now| task.move_to(TaskState::Ready, now))
    }

    /// The engine reports the agent is waiting on a question.
    pub fn ask(&self, id: TaskId, question: &str) -> Result<Task, AppError> {
        self.update(id, |task, now| task.ask(question, now))
    }

    pub fn settings(&self) -> Result<Settings, AppError> {
        Ok(self.settings.load_settings()?)
    }

    pub fn update_settings(&self, change: SettingsChange) -> Result<Settings, AppError> {
        let mut settings = self.settings.load_settings()?;
        if let Some(agent) = change.agent {
            settings.agent = Some(agent);
        }
        if let Some(at) = change.shift_start {
            settings.shift_start = at;
        }
        if let Some(n) = change.parallelism {
            settings.parallelism = Settings::check_parallelism(n)?;
        }
        self.settings.save_settings(&settings)?;
        Ok(settings)
    }

    fn update(
        &self,
        id: TaskId,
        change: impl FnOnce(
            &mut Task,
            shep_domain::UnixTime,
        ) -> Result<(), shep_domain::TransitionError>,
    ) -> Result<Task, AppError> {
        let mut task = self.tasks.get(id)?.ok_or(AppError::NotFound(id))?;
        change(&mut task, self.clock.now())?;
        self.tasks.save(&task)?;
        Ok(task)
    }
}
