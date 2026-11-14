use std::path::Path;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Mutex, MutexGuard};

use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use shep_domain::{
    AgentKind, ClockTime, PullRequest, ReviewAction, Settings, Task, TaskId, TaskSourceRef,
    TaskState, TransitionError, UnixTime,
};

use crate::ports::AgentView;
use crate::view::{Brief, Setup, TaskDetail};
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
}

impl ShepApi for Shep {
    fn add(&self, input: &str, from_dir: Option<&Path>) -> Result<Task, AppError> {
        let source = TaskSourceRef::parse(input)?;
        if let Some(dir) = from_dir {
            self.adopt_repo(dir)?;
        }
        if let Some(existing) = self.open_task_for(&source)? {
            return Ok(existing);
        }
        let _guard = self.lock()?;
        Ok(self.ports.tasks.create(source, self.ports.clock.now())?)
    }

    /// Starts queued tasks now (oldest first, up to the parallel limit) and keeps filling free
    /// slots until the queue is empty; or sets the time the shift starts by itself.
    fn start(&self, when: StartWhen) -> Result<StartOutcome, AppError> {
        self.ensure_ready()?;
        match when {
            StartWhen::At(at) => {
                self.update_settings(SettingsChange {
                    shift_start: Some(at),
                    nightly: Some(true),
                    ..SettingsChange::default()
                })?;
                Ok(StartOutcome::Scheduled {
                    at,
                    queued: self.board()?.queued.len(),
                })
            }
            StartWhen::Now => {
                self.open_shift();
                Ok(StartOutcome::Started(self.start_queued()?))
            }
        }
    }

    fn board(&self) -> Result<Board, AppError> {
        Ok(Board::from_tasks(self.ports.tasks.list()?))
    }

    /// Merge merges the pull request first; if GitHub refuses, the task stays Ready and the
    /// person hears why. Once merged, the task's worktree and local branch are removed.
    fn review(&self, id: TaskId, action: ReviewAction) -> Result<Task, AppError> {
        let merging = action == ReviewAction::Merge;
        if merging {
            let task = self.ports.tasks.get(id)?.ok_or(AppError::NotFound(id))?;
            task.clone()
                .review(ReviewAction::Merge, self.ports.clock.now())?;
            self.merge(&task)?;
        }
        let task = self.update(id, |task, now| task.review(action, now))?;
        if merging {
            self.clean_up(&task);
        }
        Ok(task)
    }

    fn settings(&self) -> Result<Settings, AppError> {
        Ok(self.ports.settings.load_settings()?)
    }

    fn detail(&self, id: TaskId) -> Result<TaskDetail, AppError> {
        Shep::detail(self, id)
    }

    fn brief(&self) -> Result<Brief, AppError> {
        Shep::brief(self)
    }

    fn morning_brief(&self) -> Result<Option<Brief>, AppError> {
        Shep::morning_brief(self)
    }

    fn first_run_today(&self) -> Result<bool, AppError> {
        Shep::first_run_today(self)
    }

    fn add_label(&self, label: &str, from_dir: Option<&Path>) -> Result<Vec<Task>, AppError> {
        Shep::add_label(self, label, from_dir)
    }

    fn watch_agent(&self, id: TaskId) -> Result<Box<dyn AgentView>, AppError> {
        Shep::watch_agent(self, id)
    }

    fn send_to_agent(&self, id: TaskId, bytes: &[u8]) -> Result<(), AppError> {
        Shep::send_to_agent(self, id, bytes)
    }

    fn setup(&self, from_dir: Option<&Path>) -> Result<Setup, AppError> {
        Shep::setup(self, from_dir)
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
        if let Some(nightly) = change.nightly {
            settings.nightly = nightly;
        }
        if let Some(keep_awake) = change.keep_awake {
            settings.keep_awake = keep_awake;
        }
        self.ports.settings.save_settings(&settings)?;
        Ok(settings)
    }
}
