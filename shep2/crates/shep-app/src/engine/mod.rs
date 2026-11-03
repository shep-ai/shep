//! The engine: carries every Working task through its run, one step at a time, on each tick.
//!
//! Prepare (worktree from origin) → agent → publish (push, draft PR) → CI (fix up to three
//! times) → second opinion → Ready. Every step is saved, so a restarted daemon picks up where
//! it stopped; agent sessions live in the PTY holder and outlive the daemon.

mod agent;
mod paths;
mod pr_body;
mod prompts;
mod steps;
mod time;

use std::path::PathBuf;
use std::sync::{Arc, Mutex};

use shep_domain::{EventKind, Run, RunStep, Task, TaskEvent, TaskId, TaskState, UnixTime};

use crate::{AppError, Ports, Shep, ShepApi};

pub use prompts::{
    AGENT_ENV_PROOF_DIR, AGENT_ENV_QUESTION_FILE, AGENT_ENV_REVIEW_FILE, AGENT_ENV_TASK,
};

/// Steps one task may take in one tick, so a tick always ends.
const MAX_STEPS_PER_TICK: usize = 8;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct EngineConfig {
    /// How often CI is asked about.
    pub ci_poll_secs: i64,
    /// How long after a push "no checks" is taken to mean the repository has no CI.
    pub ci_no_checks_grace_secs: i64,
    /// How long CI may run before the task needs a person.
    pub ci_timeout_secs: i64,
    /// How long to park when an agent hits a usage limit without saying when it resets.
    pub park_fallback_secs: i64,
    /// The wait before retrying a failed step grows by this much per failure.
    pub retry_after_secs: i64,
    /// Failures in a row before a step asks for a person.
    pub max_step_failures: u8,
    /// Times a crashed agent is restarted before the task needs a person.
    pub max_agent_restarts: u8,
}

impl Default for EngineConfig {
    fn default() -> Self {
        Self {
            ci_poll_secs: 30,
            ci_no_checks_grace_secs: 120,
            ci_timeout_secs: 90 * 60,
            park_fallback_secs: 30 * 60,
            retry_after_secs: 60,
            max_step_failures: 5,
            max_agent_restarts: 2,
        }
    }
}

/// What a step leaves for the rest of the tick.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Flow {
    /// Go straight on to the next step.
    Next,
    /// Nothing more to do for this task until a later tick.
    Wait,
}

/// A step that could not be done, for the failure count and, in the end, for a person.
#[derive(Debug)]
struct StepError {
    doing: &'static str,
    message: String,
}

impl StepError {
    fn new(doing: &'static str, e: impl std::fmt::Display) -> Self {
        Self {
            doing,
            message: e.to_string(),
        }
    }
}

type StepResult = Result<Flow, StepError>;

pub struct Engine {
    shep: Arc<Shep>,
    ports: Ports,
    config: EngineConfig,
    /// The local day the scheduled shift last opened, so it opens once a day.
    shift_opened_on: Mutex<Option<i64>>,
}

impl Engine {
    /// A restarted daemon finds tasks still Working: their shift is still open.
    pub fn new(shep: Arc<Shep>, ports: Ports, config: EngineConfig) -> Self {
        if shep.board().is_ok_and(|b| !b.working.is_empty()) {
            shep.open_shift();
        }
        Self {
            shep,
            ports,
            config,
            shift_opened_on: Mutex::new(None),
        }
    }

    /// One pass over everything: open the shift on time, fill free slots, move every Working
    /// task on, and keep the machine awake while anything works. Problems with one task are
    /// recorded on that task and never stop the others.
    pub fn tick(&self) {
        self.open_scheduled_shift();
        if self.shep.shift_open() {
            let _ = self.shep.start_queued();
        }
        let Ok(board) = self.shep.board() else { return };
        for task in &board.working {
            self.drive(task);
        }
        let Ok(board) = self.shep.board() else { return };
        if board.working.is_empty() {
            self.ports.awake.release();
            if board.queued.is_empty() {
                self.shep.close_shift();
            }
        } else {
            self.ports.awake.hold();
        }
    }

    fn open_scheduled_shift(&self) {
        let Ok(settings) = self.ports.settings.load_settings() else {
            return;
        };
        let (day, now) = time::local(self.ports.clock.now(), self.ports.clock.utc_offset());
        if now != settings.shift_start {
            return;
        }
        let Ok(mut opened) = self.shift_opened_on.lock() else {
            return;
        };
        if *opened != Some(day) {
            *opened = Some(day);
            self.shep.open_shift();
        }
    }

    fn drive(&self, task: &Task) {
        let now = self.now();
        let mut run = match self.ports.runs.load_run(task.id) {
            Ok(run) => run.unwrap_or_else(|| Run::new(task.id, now)),
            Err(_) => return,
        };
        if run.not_before.is_some_and(|t| now < t) {
            return;
        }
        if matches!(run.step, RunStep::Waiting | RunStep::Done) {
            steps::begin_pass(&mut run, now);
        }
        for _ in 0..MAX_STEPS_PER_TICK {
            let Ok(Some(task)) = self.ports.tasks.get(task.id) else {
                return;
            };
            if task.state != TaskState::Working {
                break;
            }
            let outcome = self.step(&task, &mut run);
            let flow = outcome.unwrap_or_else(|e| self.failed(&task, &mut run, &e));
            if self.ports.runs.save_run(&run).is_err() || flow == Flow::Wait {
                break;
            }
        }
    }

    fn step(&self, task: &Task, run: &mut Run) -> StepResult {
        match run.step.clone() {
            RunStep::Prepare => self.prepare(task, run),
            RunStep::Agent {
                job,
                session,
                interrupted,
            } => self.agent(task, run, job, session, interrupted),
            RunStep::Publish => self.publish(task, run),
            RunStep::WatchCi { since } => self.watch_ci(task, run, since),
            RunStep::Waiting | RunStep::Done => Ok(Flow::Wait),
        }
    }

    /// Retries later, waiting longer each time; after too many failures, asks a person.
    fn failed(&self, task: &Task, run: &mut Run, e: &StepError) -> Flow {
        run.failures = run.failures.saturating_add(1);
        let detail = format!("could not {}: {}", e.doing, e.message);
        self.event(task.id, EventKind::StepFailed, &detail);
        if run.failures >= self.config.max_step_failures {
            self.ask(task, run, &format!("Shep {detail}"));
        } else {
            let wait = self.config.retry_after_secs * i64::from(run.failures);
            run.not_before = Some(UnixTime(self.now().0 + wait));
        }
        Flow::Wait
    }

    /// The task needs a person; the run waits for their answer.
    fn ask(&self, task: &Task, run: &mut Run, question: &str) -> Flow {
        run.asked = Some(question.to_owned());
        run.advance(RunStep::Waiting, self.now());
        if self.shep.ask(task.id, question).is_ok() {
            self.event(task.id, EventKind::Asked, question);
        }
        Flow::Wait
    }

    fn event(&self, task_id: TaskId, kind: EventKind, detail: &str) {
        let _ = self.ports.events.record(&TaskEvent {
            task_id,
            at: self.now(),
            kind,
            detail: detail.to_owned(),
        });
    }

    fn now(&self) -> UnixTime {
        self.ports.clock.now()
    }

    fn task_dir(&self, task: &Task) -> Result<PathBuf, StepError> {
        self.ports
            .files
            .task_dir(task.id)
            .map_err(|e| StepError::new("make the task folder", e))
    }

    fn repo(&self) -> Result<PathBuf, StepError> {
        let settings = self
            .ports
            .settings
            .load_settings()
            .map_err(|e| StepError::new("read settings", e))?;
        settings
            .repo
            .map(PathBuf::from)
            .ok_or_else(|| StepError::new("find the repository", "no repository is set"))
    }
}

impl From<AppError> for StepError {
    fn from(e: AppError) -> Self {
        Self::new("save the task", e)
    }
}
