//! Watching GitHub between steps. A `shep:` comment on a Ready pull request, written by the
//! person `gh` is signed in as and nobody else, sends the task back with that note. An issue
//! closed while its task waits or works stops the task and takes it off the board.

use std::collections::HashMap;
use std::path::Path;

use shep_domain::{send_back_note, EventKind, ReviewAction, Run, Task, TaskId, UnixTime};

use super::Engine;
use crate::ports::IssueState;
use crate::{Board, ShepApi};

/// Left on a draft pull request Shep closes because its issue was closed.
const CLOSED_COMMENT: &str = "Shep stopped this task: its issue was closed.";
/// Why the task stopped, as the Stopped event and the morning brief say it.
const ISSUE_CLOSED: &str = "issue closed";
/// Notes from several comments become one, a paragraph each.
const NOTE_SEPARATOR: &str = "\n\n";

/// When each task's issue and pull request comments were last read.
#[derive(Default)]
pub(super) struct Polls {
    issues: HashMap<TaskId, UnixTime>,
    comments: HashMap<TaskId, UnixTime>,
}

/// Whether `id` is due another look after `every` seconds; if so, the look is recorded.
fn due(last: &mut HashMap<TaskId, UnixTime>, id: TaskId, now: UnixTime, every: i64) -> bool {
    if last.get(&id).is_some_and(|at| now.0 - at.0 < every) {
        return false;
    }
    last.insert(id, now);
    true
}

impl Engine {
    /// Reads the issues of Queued and Working tasks and the comments on Ready pull requests,
    /// each no more often than its poll interval. GitHub being unreachable changes nothing.
    pub(super) fn watch_github(&self, board: &Board) {
        let Ok(repo) = self.repo() else { return };
        let now = self.now();
        let (issues, comments) = {
            let Ok(mut polls) = self.polls.lock() else {
                return;
            };
            let every = self.config.issue_poll_secs;
            let issues: Vec<Task> = board
                .queued
                .iter()
                .chain(&board.working)
                .filter(|t| due(&mut polls.issues, t.id, now, every))
                .cloned()
                .collect();
            let every = self.config.comment_poll_secs;
            let comments: Vec<Task> = board
                .ready
                .iter()
                .filter(|t| t.pr.is_some())
                .filter(|t| due(&mut polls.comments, t.id, now, every))
                .cloned()
                .collect();
            let on_board =
                |id: &TaskId| board.groups().any(|(_, ts)| ts.iter().any(|t| t.id == *id));
            polls.issues.retain(|id, _| on_board(id));
            polls.comments.retain(|id, _| on_board(id));
            (issues, comments)
        };
        for task in &issues {
            if let Ok(Some(IssueState::Closed)) = self.ports.forge.issue_state(&repo, &task.source)
            {
                self.stop_closed(&repo, task);
            }
        }
        if comments.is_empty() {
            return;
        }
        let Ok(viewer) = self.ports.forge.viewer(&repo) else {
            return;
        };
        if viewer.trim().is_empty() {
            return;
        }
        for task in &comments {
            self.read_comments(&repo, task, viewer.trim());
        }
    }

    /// Every `shep:` note the person left since the task became Ready sends it back once.
    fn read_comments(&self, repo: &Path, task: &Task, viewer: &str) {
        let Some(pr) = &task.pr else { return };
        let Ok(comments) = self.ports.forge.comments(repo, pr) else {
            return;
        };
        let since = self.ready_at(task);
        let notes: Vec<String> = comments
            .iter()
            .filter(|c| c.at > since && c.author.eq_ignore_ascii_case(viewer))
            .filter_map(|c| send_back_note(&c.body))
            .collect();
        if notes.is_empty() {
            return;
        }
        let note = notes.join(NOTE_SEPARATOR);
        let action = ReviewAction::SendBack { note: note.clone() };
        if self.shep.review(task.id, action).is_ok() {
            self.event(task.id, EventKind::SentBack, &note);
        }
    }

    /// When the task last became Ready; comments from before belong to an earlier pass.
    fn ready_at(&self, task: &Task) -> UnixTime {
        self.ports
            .events
            .events(task.id)
            .unwrap_or_default()
            .iter()
            .rev()
            .find(|e| e.kind == EventKind::Ready)
            .map_or(task.updated_at, |e| e.at)
    }

    /// Stops the agent, closes the draft, removes the worktree (the branch stays) and takes
    /// the task off the board. Its events stay, so the morning brief can say why.
    fn stop_closed(&self, repo: &Path, task: &Task) {
        let run = self.ports.runs.load_run(task.id).ok().flatten();
        if let Some(session) = run.as_ref().and_then(Run::session) {
            if let Err(e) = self.ports.sessions.kill(session) {
                self.event(
                    task.id,
                    EventKind::StepFailed,
                    &format!("could not stop the agent: {e}"),
                );
            }
        }
        if let Some(pr) = &task.pr {
            if let Err(e) = self.ports.forge.close(repo, pr, CLOSED_COMMENT) {
                self.event(
                    task.id,
                    EventKind::StepFailed,
                    &format!("could not close {pr}: {e}"),
                );
            }
        }
        if let Some(worktree) = run.as_ref().and_then(|r| r.worktree.as_ref()) {
            if let Err(e) = self.ports.git.remove_worktree(repo, worktree) {
                self.event(
                    task.id,
                    EventKind::StepFailed,
                    &format!("could not remove the worktree: {e}"),
                );
            }
        }
        if self.shep.remove(task.id).is_ok() {
            let detail = format!("{} — {ISSUE_CLOSED}", task.title);
            self.event(task.id, EventKind::Stopped, &detail);
        }
    }
}
