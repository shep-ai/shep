//! One task in detail: where its run is, what it is doing in a line, and what it produced.

use std::path::Path;

use shep_domain::{
    AgentJob, CiVerdict, EventKind, Run, RunStep, Task, TaskEvent, TaskId, TaskState, UnixTime,
};

use crate::paths::TaskPaths;
use crate::ports::SessionState;
use crate::view::{DiffStat, StepView, TaskDetail};
use crate::{time, AppError, Shep};

/// Lines of a patch kept for display.
const MAX_DIFF_LINES: usize = 400;

impl Shep {
    /// Everything the split view and the Mac app show about one task.
    pub fn detail(&self, id: TaskId) -> Result<TaskDetail, AppError> {
        let ports = self.ports();
        let task = ports.tasks.get(id)?.ok_or(AppError::NotFound(id))?;
        let run = ports.runs.load_run(id)?;
        let events = ports.events.events(id)?;
        let screen = run.as_ref().and_then(|r| self.screen(r));
        let live = screen.as_ref().is_some_and(|(_, live)| *live);
        let screen = screen.map(|(text, _)| text);
        let step = step_of(&task, run.as_ref(), ports.clock.now());
        let worktree = run.as_ref().and_then(|r| r.worktree.clone());
        let (stat, diff) = worktree.as_ref().map_or((DiffStat::default(), None), |wt| {
            let stat = ports.git.diff_stat(wt).unwrap_or_default();
            let diff = ports.git.diff(wt).ok().map(|d| shorten(&d));
            (DiffStat::parse(&stat), diff)
        });
        let dir = ports.files.task_dir(id).ok();
        let proof = dir.as_ref().map_or_else(Vec::new, |d| {
            let proof_dir = TaskPaths::new(d.clone()).proof_dir();
            ports
                .files
                .list(&proof_dir)
                .iter()
                .map(|p| path(p))
                .collect()
        });
        let review = run.as_ref().and_then(|r| r.review.clone());
        let activity = activity(&ActivityInput {
            task: &task,
            run: run.as_ref(),
            step,
            screen: screen.as_deref().filter(|_| live),
            events: &events,
            utc_offset: ports.clock.utc_offset(),
        });
        Ok(TaskDetail {
            agent: ports.settings.load_settings()?.agent,
            branch: worktree.map(|wt| wt.branch.to_string()),
            checks: run.as_ref().map(|r| r.checks.clone()).unwrap_or_default(),
            task,
            step,
            activity,
            live,
            screen,
            stat,
            diff,
            proof,
            review,
            events,
        })
    }

    /// The agent's screen and whether it is still running.
    fn screen(&self, run: &Run) -> Option<(String, bool)> {
        let RunStep::Agent {
            session: Some(session),
            ..
        } = &run.step
        else {
            return None;
        };
        match self.ports().sessions.poll(session).ok()? {
            SessionState::Running { screen, .. } => Some((screen, true)),
            SessionState::Exited { screen, .. } => Some((screen, false)),
            SessionState::Lost => None,
        }
    }
}

pub(crate) fn step_of(task: &Task, run: Option<&Run>, now: UnixTime) -> StepView {
    match task.state {
        TaskState::Queued => return StepView::Queued,
        TaskState::NeedsYou => return StepView::NeedsYou,
        TaskState::Ready => return StepView::Ready,
        TaskState::Merged => return StepView::Merged,
        TaskState::Working => {}
    }
    let Some(run) = run else {
        return StepView::Preparing;
    };
    if run.not_before.is_some_and(|t| now < t) {
        return StepView::Parked;
    }
    match &run.step {
        RunStep::Prepare => StepView::Preparing,
        RunStep::Agent { job, .. } => match job {
            AgentJob::FixCi { .. } => StepView::FixingCi,
            AgentJob::Review => StepView::Reviewing,
            AgentJob::Code
            | AgentJob::Answer
            | AgentJob::Revise
            | AgentJob::ResolveConflict { .. } => StepView::Coding,
        },
        RunStep::Screenshots { .. } | RunStep::Publish => StepView::Publishing,
        RunStep::WatchCi { .. } => StepView::WatchingCi,
        RunStep::Waiting | RunStep::Done => StepView::Coding,
    }
}

pub(crate) struct ActivityInput<'a> {
    pub task: &'a Task,
    pub run: Option<&'a Run>,
    pub step: StepView,
    /// The live agent's screen.
    pub screen: Option<&'a str>,
    pub events: &'a [TaskEvent],
    pub utc_offset: i64,
}

/// What is happening, in one line.
pub(crate) fn activity(a: &ActivityInput<'_>) -> String {
    let last_line = a.screen.and_then(|s| {
        s.lines()
            .rev()
            .map(str::trim)
            .find(|l| !l.is_empty())
            .map(str::to_owned)
    });
    let checks = a.run.map(|r| r.checks.as_slice()).unwrap_or_default();
    match a.step {
        StepView::Queued => "queued".into(),
        StepView::Merged => "merged".into(),
        StepView::NeedsYou => {
            let question = a.task.question.as_deref().unwrap_or_default();
            format!("needs you: {}", question.lines().next().unwrap_or_default())
        }
        StepView::Ready => match ci_words(checks, a.events) {
            Some(words) => format!("ready · {words}"),
            None => "ready".into(),
        },
        StepView::Parked => {
            let until = a.run.and_then(|r| r.not_before).unwrap_or(UnixTime(0));
            let (_, at) = time::local(until, a.utc_offset);
            let parked = a.events.last().is_some_and(|e| e.kind == EventKind::Parked);
            if parked {
                format!("parked until {at} · usage limit")
            } else {
                format!("trying again at {at}")
            }
        }
        StepView::Preparing => "making the worktree".into(),
        StepView::Publishing
            if a.run
                .is_some_and(|r| matches!(r.step, RunStep::Screenshots { .. })) =>
        {
            "taking screenshots".into()
        }
        StepView::Publishing => "pushing and opening the draft PR".into(),
        StepView::WatchingCi if checks.is_empty() => "waiting for CI".into(),
        StepView::WatchingCi => {
            let done = checks
                .iter()
                .filter(|c| c.state != shep_domain::CheckState::Pending)
                .count();
            format!("CI running · {done} of {} checks done", checks.len())
        }
        StepView::Coding => last_line.unwrap_or_else(|| "starting the agent".into()),
        StepView::FixingCi => last_line.unwrap_or_else(|| "fixing CI".into()),
        StepView::Reviewing => last_line.unwrap_or_else(|| "second opinion".into()),
    }
}

/// "CI green" or "no CI", from the last CI word on the task.
pub(crate) fn ci_words(
    checks: &[shep_domain::CiCheck],
    events: &[TaskEvent],
) -> Option<&'static str> {
    if !checks.is_empty() && CiVerdict::of(checks) == CiVerdict::Green {
        return Some("CI green");
    }
    let last_ci = events.iter().rev().find(|e| {
        matches!(
            e.kind,
            EventKind::CiGreen | EventKind::NoCi | EventKind::CiFailed
        )
    })?;
    match last_ci.kind {
        EventKind::CiGreen => Some("CI green"),
        EventKind::NoCi => Some("no CI"),
        _ => None,
    }
}

fn shorten(diff: &str) -> String {
    diff.lines()
        .take(MAX_DIFF_LINES)
        .collect::<Vec<_>>()
        .join("\n")
}

fn path(p: &Path) -> String {
    p.display().to_string()
}
