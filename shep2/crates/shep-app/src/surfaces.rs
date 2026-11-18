//! Calls the surfaces make beyond the four core actions: adding every labelled issue, and
//! watching or typing to a task's running agent.

use std::path::{Path, PathBuf};

use shep_domain::{RunStep, SessionId, Task, TaskId, TaskSourceRef};

use crate::ports::AgentView;
use crate::{AppError, Shep, ShepApi};

impl Shep {
    /// Queues every open issue carrying `label` that is not on the board yet; returns the new
    /// tasks.
    pub fn add_label(&self, label: &str, from_dir: Option<&Path>) -> Result<Vec<Task>, AppError> {
        if let Some(dir) = from_dir {
            self.adopt_repo(dir)?;
        }
        let repo = self.repo()?;
        let issues = self.ports().forge.labelled(&repo, label)?;
        let mut added = Vec::new();
        for issue in issues {
            let source = TaskSourceRef::GitHubIssue {
                repo: None,
                number: issue.number,
            };
            if self.open_task_for(&source)?.is_some() {
                continue;
            }
            let task = self.add(&source.to_string(), None)?;
            added.push(self.retitle(task.id, &issue.title)?);
        }
        Ok(added)
    }

    /// The live terminal of the task's agent.
    pub fn watch_agent(&self, id: TaskId) -> Result<Box<dyn AgentView>, AppError> {
        let session = self.running_session(id)?;
        self.ports()
            .sessions
            .attach(&session)
            .map_err(|e| AppError::Remote(e.0))
    }

    /// Types into the task's agent.
    pub fn send_to_agent(&self, id: TaskId, bytes: &[u8]) -> Result<(), AppError> {
        let session = self.running_session(id)?;
        self.ports()
            .sessions
            .write(&session, bytes)
            .map_err(|e| AppError::Remote(e.0))
    }

    fn running_session(&self, id: TaskId) -> Result<SessionId, AppError> {
        self.ports().tasks.get(id)?.ok_or(AppError::NotFound(id))?;
        let run = self.ports().runs.load_run(id)?;
        match run.map(|r| r.step) {
            Some(RunStep::Agent {
                session: Some(session),
                ..
            }) => Ok(session),
            _ => Err(AppError::NotReady(format!(
                "task {id} has no agent running right now"
            ))),
        }
    }

    /// The repository Shep works in.
    pub(crate) fn repo(&self) -> Result<PathBuf, AppError> {
        self.ports()
            .settings
            .load_settings()?
            .repo
            .map(PathBuf::from)
            .ok_or_else(|| {
                AppError::NotReady(
                "Shep needs a repository: run `shep add` inside one, or `shep config --repo PATH`"
                    .into(),
            )
            })
    }
}
