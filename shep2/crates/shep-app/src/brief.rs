//! The morning brief: what finished overnight, what needs you, and how the night went.

use shep_domain::{EventKind, Task, TaskEvent, TaskState, UnixTime};

use crate::detail::{activity, ci_words, step_of, ActivityInput};
use crate::paths::{with_extension, TaskPaths};
use crate::ports::Mark;
use crate::view::{Brief, BriefItem, DiffStat, Overnight};
use crate::{time, AppError, Shep};

const IMAGES: [&str; 5] = ["png", "jpg", "jpeg", "gif", "webp"];

impl Shep {
    /// The brief, whenever a surface asks for it.
    pub fn brief(&self) -> Result<Brief, AppError> {
        let ports = self.ports();
        let board = self.board_now()?;
        let since = ports.marks.mark(Mark::BriefSeen)?;
        let mut items = Vec::new();
        let mut all_events = Vec::new();
        let groups = [
            (TaskState::NeedsYou, &board.needs_you),
            (TaskState::Ready, &board.ready),
            (TaskState::Working, &board.working),
        ];
        for (state, tasks) in groups {
            for task in tasks {
                let events = ports.events.events(task.id)?;
                let summary = self.summary(state, task, &events)?;
                all_events.extend(
                    events
                        .into_iter()
                        .filter(|e| since.is_none_or(|s| e.at > s)),
                );
                items.push(BriefItem {
                    task: task.clone(),
                    summary,
                });
            }
        }
        let mergeable = board
            .ready
            .iter()
            .filter(|t| t.pr.is_some())
            .filter(|t| {
                let events = ports.events.events(t.id).unwrap_or_default();
                let checks = ports
                    .runs
                    .load_run(t.id)
                    .ok()
                    .flatten()
                    .map(|r| r.checks)
                    .unwrap_or_default();
                ci_words(&checks, &events) == Some("CI green")
            })
            .count();
        Ok(Brief {
            at: ports.clock.now(),
            done: board.ready.len(),
            total: items.len(),
            items,
            while_you_slept: while_you_slept(&all_events, &board.ready),
            overnight: overnight(&all_events),
            mergeable,
        })
    }

    /// The brief once per new morning: only when something finished or needs you since it was
    /// last shown.
    pub fn morning_brief(&self) -> Result<Option<Brief>, AppError> {
        let ports = self.ports();
        let seen = ports.marks.mark(Mark::BriefSeen)?;
        let board = self.board_now()?;
        let news = board
            .needs_you
            .iter()
            .chain(&board.ready)
            .any(|t| seen.is_none_or(|s| t.updated_at > s));
        if !news {
            return Ok(None);
        }
        let brief = self.brief()?;
        ports.marks.set_mark(Mark::BriefSeen, ports.clock.now())?;
        Ok(Some(brief))
    }

    /// True the first time it is asked on a new local day (for the splash).
    pub fn first_run_today(&self) -> Result<bool, AppError> {
        let ports = self.ports();
        let now = ports.clock.now();
        let offset = ports.clock.utc_offset();
        let today = time::local(now, offset).0;
        let seen = ports.marks.mark(Mark::SplashSeen)?;
        if seen.is_some_and(|at| time::local(at, offset).0 == today) {
            return Ok(false);
        }
        ports.marks.set_mark(Mark::SplashSeen, now)?;
        Ok(true)
    }

    fn summary(
        &self,
        state: TaskState,
        task: &Task,
        events: &[TaskEvent],
    ) -> Result<String, AppError> {
        let ports = self.ports();
        let run = ports.runs.load_run(task.id)?;
        if state != TaskState::Ready {
            return Ok(activity(&ActivityInput {
                task,
                run: run.as_ref(),
                step: step_of(task, run.as_ref(), ports.clock.now()),
                screen: None,
                events,
                utc_offset: ports.clock.utc_offset(),
            }));
        }
        let mut pieces: Vec<String> = Vec::new();
        let checks = run.as_ref().map(|r| r.checks.clone()).unwrap_or_default();
        if let Some(words) = ci_words(&checks, events) {
            pieces.push(words.into());
        }
        if let Some(wt) = run.as_ref().and_then(|r| r.worktree.as_ref()) {
            let stat = DiffStat::parse(&ports.git.diff_stat(wt).unwrap_or_default());
            if stat.added + stat.removed > 0 {
                pieces.push(format!("+{} -{}", stat.added, stat.removed));
            }
        }
        let fixes = events
            .iter()
            .filter(|e| e.kind == EventKind::CiFailed)
            .count();
        if fixes > 0 {
            let s = if fixes == 1 { "" } else { "s" };
            pieces.push(format!("fixed {fixes} failure{s}"));
        }
        let dir = ports
            .files
            .task_dir(task.id)
            .map_err(|e| AppError::Remote(e.0))?;
        let proof = ports.files.list(&TaskPaths::new(dir).proof_dir());
        if with_extension(&proof, &IMAGES).next().is_some() {
            pieces.push("screenshot".into());
        }
        Ok(pieces.join(" · "))
    }
}

/// At most one line about something Shep noticed overnight.
fn while_you_slept(events: &[TaskEvent], ready: &[Task]) -> Option<String> {
    let failures: Vec<&TaskEvent> = events
        .iter()
        .filter(|e| e.kind == EventKind::CiFailed)
        .collect();
    if failures.is_empty() {
        return None;
    }
    let mut hit: Vec<_> = failures.iter().map(|e| e.task_id).collect();
    hit.sort_unstable();
    hit.dedup();
    let green = hit
        .iter()
        .filter(|id| ready.iter().any(|t| t.id == **id))
        .count();
    Some(match (failures.len(), hit.len(), green) {
        (1, _, 1) => "CI failed once overnight; Shep fixed it.".into(),
        (1, _, _) => "CI failed once overnight; it needs you.".into(),
        (n, tasks, green) => {
            format!("CI failed {n} times overnight on {tasks} tasks; {green} are green now.")
        }
    })
}

/// From the first agent started to the last task finished or asking, with time parked.
fn overnight(events: &[TaskEvent]) -> Option<Overnight> {
    let from = events
        .iter()
        .filter(|e| e.kind == EventKind::AgentStarted)
        .map(|e| e.at)
        .min()?;
    let to = events
        .iter()
        .filter(|e| matches!(e.kind, EventKind::Ready | EventKind::Asked))
        .map(|e| e.at)
        .max()?;
    let mut parked_secs = 0;
    for parked in events.iter().filter(|e| e.kind == EventKind::Parked) {
        let resumed = events
            .iter()
            .filter(|e| e.task_id == parked.task_id && e.kind == EventKind::AgentStarted)
            .map(|e| e.at)
            .find(|at| *at > parked.at)
            .unwrap_or(UnixTime(parked.at.0));
        parked_secs += resumed.0 - parked.at.0;
    }
    Some(Overnight {
        from,
        to,
        parked_secs,
    })
}
