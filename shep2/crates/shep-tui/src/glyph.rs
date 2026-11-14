//! The marks every surface uses for a task's state, and the sheep.

use shep_app::StepView;
use shep_domain::{Task, TaskSourceRef, TaskState};

pub const READY: &str = "✓";
pub const NEEDS_YOU: &str = "!";
pub const QUEUED: &str = "·";
pub const MERGED: &str = "✓";
/// Braille spinner frames for work in progress; the first one stands still without motion.
pub const SPINNER: [&str; 8] = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧"];
pub const STILL: &str = "⠿";
pub const SHEEP: &str = "@@o";
pub const SLEEPING_SHEEP: &str = "@@o z";

/// The mark for a task in a list.
pub fn mark(task: &Task, frame: Option<u64>) -> &'static str {
    match task.state {
        TaskState::Queued => QUEUED,
        TaskState::NeedsYou => NEEDS_YOU,
        TaskState::Ready => READY,
        TaskState::Merged => MERGED,
        TaskState::Working => spinner(frame),
    }
}

pub fn spinner(frame: Option<u64>) -> &'static str {
    frame.map_or(STILL, |f| {
        let len = SPINNER.len() as u64;
        SPINNER[usize::try_from(f % len).unwrap_or(0)]
    })
}

/// `#412` for an issue in Shep's repository, the reference elsewhere, the id for a sentence.
pub fn reference(task: &Task) -> String {
    match &task.source {
        TaskSourceRef::GitHubIssue { repo: None, number } => format!("#{number}"),
        TaskSourceRef::Sentence { .. } => format!("{}", task.id),
        other => other.to_string(),
    }
}

/// The title, unless it is just the reference again (an issue not read yet).
pub fn title(task: &Task) -> String {
    if task.title == task.source.to_string()
        && !matches!(task.source, TaskSourceRef::Sentence { .. })
    {
        String::new()
    } else {
        task.title.clone()
    }
}

/// A short word for a step, for headers.
pub fn step_word(step: StepView) -> &'static str {
    match step {
        StepView::Queued => "queued",
        StepView::Preparing => "preparing",
        StepView::Coding => "working",
        StepView::Publishing => "pushing",
        StepView::WatchingCi => "CI running",
        StepView::FixingCi => "fixing CI",
        StepView::Reviewing => "second opinion",
        StepView::Parked => "parked",
        StepView::NeedsYou => "needs you",
        StepView::Ready => "ready",
        StepView::Merged => "merged",
    }
}
