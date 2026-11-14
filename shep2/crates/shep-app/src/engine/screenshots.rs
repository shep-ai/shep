//! The repository's own screenshot command, from its committed `.shep/dev.json`
//! (`{"screenshot": "pnpm screenshot"}`; Shep 1's other keys may sit beside it). It runs in the
//! worktree after the coder, in the PTY holder, with `SHEP_PROOF_DIR` set; the PNGs it saves
//! there become proof on the pull request. It never holds a task back: a failure, a crash or
//! a command that runs too long is recorded and the task goes on to publish.

use std::path::Path;

use serde::Deserialize;
use shep_domain::{EventKind, Run, RunStep, SessionId, Task, UnixTime, Worktree};

use super::agent::worktree;
use super::prompts::{AGENT_ENV_PROOF_DIR, AGENT_ENV_TASK};
use super::steps::IMAGE_PROOF;
use super::{Engine, Flow, StepError, StepResult, SECS_PER_MINUTE};
use crate::paths::{with_extension, TaskPaths};
use crate::ports::{SessionSpec, SessionState};

/// Where a repository describes how it runs, relative to its root (shared with Shep 1).
const DEV_CONFIG: &str = ".shep/dev.json";
/// The command line runs through the shell, as a person would type it, after the proof
/// folder is made.
const SHELL: &str = "/bin/sh";
const SHELL_RUN: &str = "-c";

/// The part of `.shep/dev.json` Shep 2 reads. Unknown keys are ignored.
#[derive(Deserialize)]
struct DevConfig {
    #[serde(default)]
    screenshot: Option<String>,
}

impl Engine {
    /// The command the worktree's `.shep/dev.json` names, if it is readable and names one.
    pub(super) fn screenshot_command(&self, worktree: &Worktree) -> Option<String> {
        let text = self
            .ports
            .files
            .read(&Path::new(&worktree.path).join(DEV_CONFIG))?;
        let config: DevConfig = serde_json::from_str(&text).ok()?;
        let command = config.screenshot?.trim().to_owned();
        (!command.is_empty()).then_some(command)
    }

    pub(super) fn screenshots(
        &self,
        task: &Task,
        run: &mut Run,
        session: Option<SessionId>,
        since: UnixTime,
    ) -> StepResult {
        let Some(session) = session else {
            return self.start_screenshots(task, run);
        };
        let detail = match self.ports.sessions.poll(&session) {
            Ok(SessionState::Running { .. })
                if self.now().0 - since.0 <= self.config.screenshot_timeout_secs =>
            {
                return Ok(Flow::Wait);
            }
            Ok(SessionState::Running { .. }) => {
                let _ = self.ports.sessions.kill(&session);
                format!(
                    "the screenshot command ran longer than {} minutes and was stopped",
                    self.config.screenshot_timeout_secs / SECS_PER_MINUTE
                )
            }
            Ok(SessionState::Exited { code: Some(0), .. }) => self.saved(task)?,
            Ok(SessionState::Exited { code, .. }) => match code {
                Some(code) => format!("the screenshot command failed (exit {code})"),
                None => "the screenshot command was stopped".into(),
            },
            Ok(SessionState::Lost) => "the screenshot command was lost".into(),
            Err(e) => format!("the screenshot command could not be checked: {e}"),
        };
        self.event(task.id, EventKind::Screenshots, &detail);
        Ok(self.to_publish(run))
    }

    fn start_screenshots(&self, task: &Task, run: &mut Run) -> StepResult {
        let worktree = worktree(run)?;
        let Some(command) = self.screenshot_command(&worktree) else {
            return Ok(self.to_publish(run));
        };
        let paths = TaskPaths::new(self.task_dir(task)?);
        let mut env = vec![
            (AGENT_ENV_TASK.to_owned(), task.id.to_string()),
            (
                AGENT_ENV_PROOF_DIR.to_owned(),
                paths.proof_dir().display().to_string(),
            ),
        ];
        env.extend(
            self.ports
                .git
                .agent_env(&worktree)
                .map_err(|e| StepError::new("guard the worktree's pushes", e))?,
        );
        let now = self.now();
        let spec = SessionSpec {
            program: SHELL.into(),
            args: vec![
                SHELL_RUN.into(),
                format!("mkdir -p \"${AGENT_ENV_PROOF_DIR}\" && {command}"),
            ],
            cwd: worktree.path.clone().into(),
            env,
            log: paths.screenshot_log(now),
        };
        match self.ports.sessions.spawn(&spec) {
            Ok(session) => {
                run.step = RunStep::Screenshots {
                    session: Some(session),
                    since: now,
                };
                Ok(Flow::Wait)
            }
            Err(e) => {
                let detail = format!("the screenshot command could not start: {e}");
                self.event(task.id, EventKind::Screenshots, &detail);
                Ok(self.to_publish(run))
            }
        }
    }

    /// How many images the proof folder holds now.
    fn saved(&self, task: &Task) -> Result<String, StepError> {
        let paths = TaskPaths::new(self.task_dir(task)?);
        let files = self.ports.files.list(&paths.proof_dir());
        Ok(match with_extension(&files, &IMAGE_PROOF).count() {
            0 => "the screenshot command saved no images".into(),
            1 => "1 screenshot".into(),
            n => format!("{n} screenshots"),
        })
    }

    fn to_publish(&self, run: &mut Run) -> Flow {
        run.advance(RunStep::Publish, self.now());
        Flow::Next
    }
}
