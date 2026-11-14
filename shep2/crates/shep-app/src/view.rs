//! What the surfaces show beyond the board: one task in detail, and the morning brief.

use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use shep_domain::{AgentKind, CiCheck, Task, TaskEvent, UnixTime};

/// Where a task is, in words every surface uses the same way.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub enum StepView {
    Queued,
    Preparing,
    Coding,
    Publishing,
    WatchingCi,
    FixingCi,
    Reviewing,
    /// Waiting out a usage limit, or a retry after a failure.
    Parked,
    NeedsYou,
    Ready,
    Merged,
}

/// Lines and files a change touches.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub struct DiffStat {
    pub files: u32,
    pub added: u32,
    pub removed: u32,
}

impl DiffStat {
    /// Reads the last line of `git diff --stat`, like ` 3 files changed, 41 insertions(+), 12
    /// deletions(-)`, or counts the `+`/`-` of a single-file line like ` src/app.rs | 2 +-`.
    pub fn parse(stat: &str) -> Self {
        let Some(last) = stat.lines().rev().find(|l| !l.trim().is_empty()) else {
            return Self::default();
        };
        if !last.contains("changed") {
            let marks = last.rsplit('|').next().unwrap_or_default();
            let count = |c| u32::try_from(marks.matches(c).count()).unwrap_or(0);
            return Self {
                files: 1,
                added: count('+'),
                removed: count('-'),
            };
        }
        let mut stat = Self::default();
        for part in last.split(',') {
            let n = part
                .split_whitespace()
                .next()
                .and_then(|n| n.parse().ok())
                .unwrap_or(0);
            if part.contains("file") {
                stat.files = n;
            } else if part.contains("insertion") {
                stat.added = n;
            } else if part.contains("deletion") {
                stat.removed = n;
            }
        }
        stat
    }
}

/// One task, as the split view and the Mac app show it.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub struct TaskDetail {
    pub task: Task,
    pub step: StepView,
    /// One line on what is happening now.
    pub activity: String,
    pub agent: Option<AgentKind>,
    pub branch: Option<String>,
    /// Whether an agent session is running for it right now.
    pub live: bool,
    /// The agent's screen, while it has one.
    pub screen: Option<String>,
    pub checks: Vec<CiCheck>,
    pub stat: DiffStat,
    /// The change as a patch (shortened for display).
    pub diff: Option<String>,
    /// Proof files on this machine: test output and screenshots.
    pub proof: Vec<String>,
    /// The second opinion.
    pub review: Option<String>,
    pub events: Vec<TaskEvent>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub struct BriefItem {
    pub task: Task,
    /// "CI green · +41 -12 · screenshot", "needs you: which bucket?".
    pub summary: String,
}

/// When the night's work ran.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub struct Overnight {
    pub from: UnixTime,
    pub to: UnixTime,
    /// Time spent parked at usage limits.
    pub parked_secs: i64,
}

/// What finished overnight and what needs you, for the first look in the morning.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub struct Brief {
    pub at: UnixTime,
    /// Needs you first, then ready, then still working.
    pub items: Vec<BriefItem>,
    /// At most one line about something Shep noticed.
    pub while_you_slept: Option<String>,
    pub overnight: Option<Overnight>,
    /// Ready for review.
    pub done: usize,
    pub total: usize,
    /// Ready, with CI green and a pull request: the "merge the N green" button.
    pub mergeable: usize,
}
