//! The four core actions and everything else a surface asks for, answered in-process.

use std::collections::BTreeMap;
use std::path::Path;

use shep_domain::{ReviewAction, Settings, SourceKind, Task, TaskId, TaskSourceRef};

use crate::ports::AgentView;
use crate::view::{Brief, Candidate, Setup, SourceStatus, TaskDetail};
use crate::{AppError, Board, SettingsChange, Shep, ShepApi, StartOutcome, StartWhen};

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
        Ok(self
            .ports()
            .tasks
            .create(source, self.ports().clock.now())?)
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
        Ok(Board::from_tasks(self.ports().tasks.list()?))
    }

    /// Merge merges the pull request first; if GitHub refuses, the task stays Ready and the
    /// person hears why. Once merged, the task's worktree and local branch are removed.
    fn review(&self, id: TaskId, action: ReviewAction) -> Result<Task, AppError> {
        let merging = action == ReviewAction::Merge;
        if merging {
            let task = self.ports().tasks.get(id)?.ok_or(AppError::NotFound(id))?;
            task.clone()
                .review(ReviewAction::Merge, self.ports().clock.now())?;
            self.merge(&task)?;
        }
        let task = self.update(id, |task, now| task.review(action, now))?;
        if merging {
            self.clean_up(&task);
        }
        Ok(task)
    }

    fn settings(&self) -> Result<Settings, AppError> {
        Ok(self.ports().settings.load_settings()?)
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

    fn sources(&self) -> Result<Vec<SourceStatus>, AppError> {
        self.source_statuses()
    }

    fn connect_source(
        &self,
        kind: SourceKind,
        values: &BTreeMap<String, String>,
    ) -> Result<SourceStatus, AppError> {
        self.connect_to(kind, values)
    }

    fn disconnect_source(&self, kind: SourceKind) -> Result<(), AppError> {
        self.disconnect_from(kind)
    }

    fn candidates(&self, limit: usize) -> Result<Vec<Candidate>, AppError> {
        self.source_candidates(limit)
    }

    fn update_settings(&self, change: SettingsChange) -> Result<Settings, AppError> {
        let _guard = self.lock()?;
        let mut settings = self.ports().settings.load_settings()?;
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
        self.ports().settings.save_settings(&settings)?;
        Ok(settings)
    }
}
