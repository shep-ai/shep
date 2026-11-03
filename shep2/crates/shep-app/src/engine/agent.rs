//! The agent step: start the session, watch it, and act on how it ended.

use std::sync::Arc;

use shep_domain::{
    conversation_id, AgentJob, AgentStatus, EventKind, ResetAt, Run, RunStep, SessionId, Task,
    Worktree,
};

use super::paths::TaskPaths;
use super::prompts::{
    self, PromptContext, AGENT_ENV_PROOF_DIR, AGENT_ENV_QUESTION_FILE, AGENT_ENV_REVIEW_FILE,
    AGENT_ENV_TASK,
};
use super::{time, Engine, Flow, StepError, StepResult};
use crate::ports::{AgentProvider, AgentRequest, SessionSpec, SessionState};

/// Lines of the agent's last screen quoted when it stops with an error.
const ERROR_TAIL_LINES: usize = 12;

impl Engine {
    pub(super) fn agent(
        &self,
        task: &Task,
        run: &mut Run,
        job: AgentJob,
        session: Option<SessionId>,
        interrupted: bool,
    ) -> StepResult {
        let provider = self.provider()?;
        let Some(session) = session else {
            return self.spawn(task, run, job, interrupted, provider.as_ref());
        };
        let state = self
            .ports
            .sessions
            .poll(&session)
            .map_err(|e| StepError::new("check on the agent", e))?;
        match state {
            SessionState::Running { status, screen } => {
                if let Some(resets) = usage_limit(status, &screen, provider.as_ref()) {
                    let _ = self.ports.sessions.kill(&session);
                    self.park(task, run, job, resets);
                }
                Ok(Flow::Wait)
            }
            SessionState::Lost => {
                self.event(
                    task.id,
                    EventKind::Interrupted,
                    "the agent's session was lost",
                );
                run.step = RunStep::Agent {
                    job,
                    session: None,
                    interrupted: true,
                };
                Ok(Flow::Next)
            }
            SessionState::Exited {
                code,
                status,
                screen,
            } => self.exited(task, run, job, code, status, &screen, provider.as_ref()),
        }
    }

    fn provider(&self) -> Result<Arc<dyn AgentProvider>, StepError> {
        let settings = self
            .ports
            .settings
            .load_settings()
            .map_err(|e| StepError::new("read settings", e))?;
        let kind = settings
            .agent
            .ok_or_else(|| StepError::new("choose an agent", "no agent is set"))?;
        Ok(self.ports.agents.provider(kind))
    }

    fn spawn(
        &self,
        task: &Task,
        run: &mut Run,
        job: AgentJob,
        interrupted: bool,
        provider: &dyn AgentProvider,
    ) -> StepResult {
        let worktree = worktree(run)?;
        let paths = TaskPaths::new(self.task_dir(task)?);
        let files = &self.ports.files;
        files.remove(&paths.question());
        let cwd = if job == AgentJob::Review {
            let diff = self
                .ports
                .git
                .diff(&worktree)
                .map_err(|e| StepError::new("read the diff", e))?;
            files.remove(&paths.review());
            files
                .write(&paths.diff(), &diff)
                .map_err(|e| StepError::new("save the diff", e))?;
            paths.review_dir()
        } else {
            worktree.path.clone().into()
        };
        let details = files.read(&paths.issue());
        let ci_log = match &job {
            AgentJob::FixCi { attempt, .. } => Some(paths.ci_log(*attempt)),
            _ => None,
        };
        let context = PromptContext {
            task,
            details: details.as_deref(),
            worktree: &worktree,
            question_file: &paths.question(),
            proof_dir: &paths.proof_dir(),
            review_file: &paths.review(),
            diff_file: &paths.diff(),
            asked: run.asked.as_deref(),
            ci_log: ci_log.as_deref(),
        };
        let prompt = prompts::build(&job, interrupted, &context);
        let conversation = conversation_id(task, job.role());
        let command = provider.command(&AgentRequest {
            prompt: &prompt,
            conversation: &conversation,
            resume: interrupted || job.continues_conversation(),
        });
        let mut env = vec![
            (AGENT_ENV_TASK.to_owned(), task.id.to_string()),
            (AGENT_ENV_QUESTION_FILE.to_owned(), path(&paths.question())),
            (AGENT_ENV_PROOF_DIR.to_owned(), path(&paths.proof_dir())),
        ];
        if job == AgentJob::Review {
            env.push((AGENT_ENV_REVIEW_FILE.to_owned(), path(&paths.review())));
        }
        let spec = SessionSpec {
            program: command.program,
            args: command.args,
            cwd,
            env,
            log: paths.agent_log(self.now()),
        };
        let session = self
            .ports
            .sessions
            .spawn(&spec)
            .map_err(|e| StepError::new("start the agent", e))?;
        self.event(task.id, EventKind::AgentStarted, &describe(&job));
        run.not_before = None;
        run.step = RunStep::Agent {
            job,
            session: Some(session),
            interrupted,
        };
        Ok(Flow::Wait)
    }

    #[allow(clippy::too_many_arguments)]
    fn exited(
        &self,
        task: &Task,
        run: &mut Run,
        job: AgentJob,
        code: Option<i32>,
        status: Option<AgentStatus>,
        screen: &str,
        provider: &dyn AgentProvider,
    ) -> StepResult {
        let paths = TaskPaths::new(self.task_dir(task)?);
        let question = self.ports.files.read(&paths.question());
        if let Some(question) = question.filter(|q| !q.trim().is_empty()) {
            self.ports.files.remove(&paths.question());
            return Ok(self.ask(task, run, question.trim()));
        }
        if let Some(resets) = usage_limit(status, screen, provider) {
            self.park(task, run, job, resets);
            return Ok(Flow::Wait);
        }
        if code != Some(0) {
            run.failures = run.failures.saturating_add(1);
            if run.failures > self.config.max_agent_restarts {
                let tail = tail(screen);
                return Ok(self.ask(
                    task,
                    run,
                    &format!("The agent stopped with an error and did not recover:\n{tail}"),
                ));
            }
            self.event(
                task.id,
                EventKind::Interrupted,
                "the agent stopped with an error",
            );
            run.step = RunStep::Agent {
                job,
                session: None,
                interrupted: true,
            };
            return Ok(Flow::Next);
        }
        self.event(task.id, EventKind::AgentFinished, &describe(&job));
        if job == AgentJob::Review {
            return self.complete(task, run);
        }
        self.after_work(task, run)
    }

    /// Commits what the agent left, then publishes, unless nothing changed at all.
    fn after_work(&self, task: &Task, run: &mut Run) -> StepResult {
        let worktree = worktree(run)?;
        let git = &self.ports.git;
        git.commit_all(&worktree, &task.title)
            .map_err(|e| StepError::new("commit the agent's work", e))?;
        let ahead = git
            .commits_ahead(&worktree)
            .map_err(|e| StepError::new("count the commits", e))?;
        if ahead == 0 {
            return Ok(self.ask(
                task,
                run,
                "The agent finished without changing anything. What should it do?",
            ));
        }
        run.advance(RunStep::Publish, self.now());
        Ok(Flow::Next)
    }

    /// Stops until the usage limit lifts; the same job then picks up where it stopped.
    fn park(&self, task: &Task, run: &mut Run, job: AgentJob, resets: ResetAt) {
        let offset = self.ports.clock.utc_offset();
        let until = time::reset_at(resets, self.now(), offset, self.config.park_fallback_secs);
        let (_, clock) = time::local(until, offset);
        self.event(
            task.id,
            EventKind::Parked,
            &format!("usage limit; parked until {clock}"),
        );
        run.not_before = Some(until);
        run.step = RunStep::Agent {
            job,
            session: None,
            interrupted: true,
        };
    }
}

pub(super) fn worktree(run: &Run) -> Result<Worktree, StepError> {
    run.worktree
        .clone()
        .ok_or_else(|| StepError::new("find the worktree", "the task has none yet"))
}

fn usage_limit(
    status: Option<AgentStatus>,
    screen: &str,
    provider: &dyn AgentProvider,
) -> Option<ResetAt> {
    let status = status
        .filter(AgentStatus::is_usage_limit)
        .or_else(|| provider.read_screen(screen));
    match status {
        Some(AgentStatus::UsageLimit { resets }) => Some(resets),
        _ => None,
    }
}

fn describe(job: &AgentJob) -> String {
    match job {
        AgentJob::Code => "coding".into(),
        AgentJob::Answer => "carrying on with the answer".into(),
        AgentJob::Revise => "making the requested changes".into(),
        AgentJob::FixCi { attempt, checks } => {
            format!("fix {attempt} for {}", checks.join(", "))
        }
        AgentJob::Review => "second opinion".into(),
    }
}

fn tail(screen: &str) -> String {
    let lines: Vec<&str> = screen.lines().filter(|l| !l.trim().is_empty()).collect();
    lines[lines.len().saturating_sub(ERROR_TAIL_LINES)..].join("\n")
}

fn path(p: &std::path::Path) -> String {
    p.display().to_string()
}
