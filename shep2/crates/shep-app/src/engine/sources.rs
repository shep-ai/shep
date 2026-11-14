//! Watching connected sources between steps: work handed over there becomes a task and is
//! acknowledged in place; questions, Ready and Merged are said there once each; an answer, a
//! `shep:` note or a Merge button there acts like the same decision made in Shep.

use std::collections::HashMap;

use shep_domain::{
    send_back_note, EventKind, ReviewAction, SourceKind, Task, TaskId, TaskState, UnixTime,
};

use super::github::due;
use super::Engine;
use crate::ports::{Reply, TaskSource, Update};
use crate::{Board, ShepApi};

/// Notes from several replies become one, a paragraph each.
const NOTE_SEPARATOR: &str = "\n\n";

/// What Shep last did with each source and task, so it reads and speaks within rate limits and
/// says each thing once.
#[derive(Default)]
pub(super) struct SourcePolls {
    sources: HashMap<SourceKind, UnixTime>,
    replies: HashMap<TaskId, UnixTime>,
    /// The state and last change of each task, as last reported (or found already reported).
    said: HashMap<TaskId, (TaskState, UnixTime)>,
    /// When a report that failed was last tried.
    retries: HashMap<TaskId, UnixTime>,
}

impl Engine {
    /// Reads each connected source once per poll interval, then reports and reads replies for
    /// the tasks that came from one. A source being unreachable changes nothing.
    pub(super) fn watch_sources(&self) {
        let Ok(connected) = self.shep.connected_sources() else {
            return;
        };
        if connected.is_empty() {
            return;
        }
        let now = self.now();
        for (kind, source) in &connected {
            let due_now = self
                .source_polls
                .lock()
                .is_ok_and(|mut p| due(&mut p.sources, *kind, now, self.config.source_poll_secs));
            if !due_now {
                continue;
            }
            for item in source.poll().unwrap_or_default() {
                let _ = self.shep.take_hand_over(&item);
            }
        }
        let Ok(board) = self.shep.board() else { return };
        for (kind, source) in &connected {
            for task in tasks_from(&board, *kind) {
                self.say(task, source.as_ref());
                if matches!(task.state, TaskState::NeedsYou | TaskState::Ready) {
                    self.hear(task, source.as_ref());
                }
            }
        }
    }

    /// Says where the task stands in its source, once per change.
    fn say(&self, task: &Task, source: &dyn TaskSource) {
        let now_seen = (task.state, task.updated_at);
        let Ok(mut polls) = self.source_polls.lock() else {
            return;
        };
        if polls.said.get(&task.id) == Some(&now_seen) {
            return;
        }
        let Some(update) = self.update_for(task) else {
            polls.said.insert(task.id, now_seen);
            return;
        };
        if self.said_before(task) {
            polls.said.insert(task.id, now_seen);
            return;
        }
        let retry = self.config.source_poll_secs;
        if !due(&mut polls.retries, task.id, self.now(), retry) {
            return;
        }
        drop(polls);
        if source.report(&task.source, &update).is_err() {
            return;
        }
        self.event(task.id, EventKind::Reported, state_word(task.state));
        if let Ok(mut polls) = self.source_polls.lock() {
            polls.said.insert(task.id, now_seen);
            polls.retries.remove(&task.id);
        }
    }

    /// What to say for the task's state; `None` while it works.
    fn update_for(&self, task: &Task) -> Option<Update> {
        match task.state {
            TaskState::Queued => {
                let settings = self.ports.settings.load_settings().ok()?;
                let repo = settings
                    .repo
                    .as_deref()
                    .and_then(|r| self.ports.git.describe(r.as_ref()).ok())
                    .and_then(|info| info.slug);
                Some(Update::Queued {
                    starts: settings.nightly.then_some(settings.shift_start),
                    repo,
                })
            }
            TaskState::Working => None,
            TaskState::NeedsYou => Some(Update::Asked {
                question: task.question.clone().unwrap_or_default(),
            }),
            TaskState::Ready => Some(Update::Ready {
                pr: task.pr.clone()?,
                summary: self
                    .shep
                    .summary(TaskState::Ready, task, &self.events_of(task.id))
                    .unwrap_or_default(),
                proof: self.shep.proof_images(task).unwrap_or_default(),
            }),
            TaskState::Merged => Some(Update::Merged {
                pr: task.pr.clone()?,
            }),
        }
    }

    /// After a restart: whether this state was already said since the task last changed.
    /// A queued task is acknowledged once, ever.
    fn said_before(&self, task: &Task) -> bool {
        let word = state_word(task.state);
        self.events_of(task.id).iter().rev().any(|e| {
            e.kind == EventKind::Reported
                && e.detail == word
                && (task.state == TaskState::Queued || e.at >= task.updated_at)
        })
    }

    /// Acts on what people did in the source since Shep last spoke there.
    fn hear(&self, task: &Task, source: &dyn TaskSource) {
        let every = self.config.comment_poll_secs;
        let now = self.now();
        let due_now = self
            .source_polls
            .lock()
            .is_ok_and(|mut p| due(&mut p.replies, task.id, now, every));
        if !due_now {
            return;
        }
        let since = self
            .events_of(task.id)
            .iter()
            .rev()
            .find(|e| e.kind == EventKind::Reported)
            .map_or(task.updated_at, |e| e.at);
        let Ok(replies) = source.replies(&task.source, since) else {
            return;
        };
        let action = match task.state {
            TaskState::NeedsYou => answer(&replies),
            TaskState::Ready => decision(&replies),
            _ => None,
        };
        let Some(action) = action else { return };
        let sent_back = matches!(action, ReviewAction::SendBack { .. });
        if self.shep.review(task.id, action).is_ok() && sent_back {
            let from = task.source.kind().display_name();
            self.event(task.id, EventKind::SentBack, &format!("from {from}"));
        }
    }

    fn events_of(&self, id: TaskId) -> Vec<shep_domain::TaskEvent> {
        self.ports.events.events(id).unwrap_or_default()
    }
}

/// Every task on the board that came from this source.
fn tasks_from(board: &Board, kind: SourceKind) -> impl Iterator<Item = &Task> {
    board
        .groups()
        .flat_map(|(_, tasks)| tasks.iter())
        .filter(move |t| t.source.kind() == kind)
}

/// The first thing anyone said answers the question.
fn answer(replies: &[Reply]) -> Option<ReviewAction> {
    replies.iter().find_map(|r| match r {
        Reply::Said { text, .. } if !text.trim().is_empty() => Some(ReviewAction::Answer {
            text: text.trim().to_owned(),
        }),
        _ => None,
    })
}

/// A Merge button merges; otherwise `shep:` notes send the work back, joined into one.
fn decision(replies: &[Reply]) -> Option<ReviewAction> {
    if replies.iter().any(|r| matches!(r, Reply::Merge { .. })) {
        return Some(ReviewAction::Merge);
    }
    let notes: Vec<String> = replies
        .iter()
        .filter_map(|r| match r {
            Reply::Said { text, .. } => send_back_note(text),
            Reply::Merge { .. } => None,
        })
        .collect();
    (!notes.is_empty()).then(|| ReviewAction::SendBack {
        note: notes.join(NOTE_SEPARATOR),
    })
}

/// How a Reported event names what was said.
fn state_word(state: TaskState) -> &'static str {
    match state {
        TaskState::Queued => "queued",
        TaskState::Working => "working",
        TaskState::NeedsYou => "asked",
        TaskState::Ready => "ready",
        TaskState::Merged => "merged",
    }
}
