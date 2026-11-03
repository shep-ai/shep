use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

use crate::{Task, TaskBranch, TaskId, UnixTime};

/// CI gets this many fixes before the task needs a person.
pub const MAX_CI_FIXES: u8 = 3;

/// A session in the PTY holder.
#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize, JsonSchema)]
pub struct SessionId(pub String);

impl std::fmt::Display for SessionId {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(&self.0)
    }
}

/// A task's own checkout: a git worktree on its task branch, made from `origin/<base>`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub struct Worktree {
    pub path: String,
    pub branch: TaskBranch,
    /// The repository's default branch the task branch starts from and the PR targets.
    pub base: String,
}

/// What an agent session is asked to do.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub enum AgentJob {
    /// The first pass at the task.
    Code,
    /// The person answered the agent's question (the task's note).
    Answer,
    /// The person sent the work back with a note (the task's note).
    Revise,
    /// CI failed on these checks; `attempt` counts from 1.
    FixCi { attempt: u8, checks: Vec<String> },
    /// The second opinion: a separate reviewer agent reads the diff.
    Review,
}

/// Which conversation a job belongs to. The reviewer never shares the coder's.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub enum ConversationRole {
    Coder,
    Reviewer,
}

impl AgentJob {
    /// Whether the job carries on the coder's earlier conversation rather than starting one.
    pub fn continues_conversation(&self) -> bool {
        matches!(self, Self::Answer | Self::Revise | Self::FixCi { .. })
    }

    pub fn role(&self) -> ConversationRole {
        match self {
            Self::Review => ConversationRole::Reviewer,
            _ => ConversationRole::Coder,
        }
    }
}

/// Where a task is in its run. Saved after every step, so a restarted daemon picks up here.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub enum RunStep {
    /// Read the source, make the worktree.
    Prepare,
    /// An agent works. `session` is `None` until it starts, and again after an interruption
    /// (a usage limit, a lost session), when `interrupted` says to pick up where it stopped.
    Agent {
        job: AgentJob,
        session: Option<SessionId>,
        interrupted: bool,
    },
    /// Push the task branch and open (or update) the draft pull request.
    Publish,
    /// Wait for CI on what was pushed at `since`.
    WatchCi { since: UnixTime },
    /// The task needs a person; the run goes on when the task is Working again.
    Waiting,
    /// Ready for review; a send-back starts a new pass.
    Done,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub struct Run {
    pub task_id: TaskId,
    pub step: RunStep,
    pub worktree: Option<Worktree>,
    /// CI fixes tried since the last push a person asked for.
    pub ci_fixes: u8,
    /// Failures in a row of the current step; reset when a step succeeds.
    pub failures: u8,
    /// The run is left alone until then: a usage limit's reset, or a retry after a failure.
    pub not_before: Option<UnixTime>,
    /// The question the agent last asked, kept to remind it when the answer comes.
    pub asked: Option<String>,
    /// When CI was last asked about.
    pub checked_at: Option<UnixTime>,
    /// The reviewer's second opinion, once given.
    pub review: Option<String>,
    pub updated_at: UnixTime,
}

impl Run {
    pub fn new(task_id: TaskId, now: UnixTime) -> Self {
        Self {
            task_id,
            step: RunStep::Prepare,
            worktree: None,
            ci_fixes: 0,
            failures: 0,
            not_before: None,
            asked: None,
            checked_at: None,
            review: None,
            updated_at: now,
        }
    }

    /// Moves to the next step and clears the failure count.
    pub fn advance(&mut self, step: RunStep, now: UnixTime) {
        self.step = step;
        self.failures = 0;
        self.updated_at = now;
    }
}

/// A stable conversation id (a UUID) for the task's agent conversation, so a later session can
/// resume exactly that conversation. Built from the task, so it survives restarts.
pub fn conversation_id(task: &Task, role: ConversationRole) -> String {
    let role_bits: u16 = match role {
        ConversationRole::Coder => 0,
        ConversationRole::Reviewer => 1,
    };
    // Only the low 32 bits of the creation time are kept; with the id that is unique enough.
    let created = task.created_at.0 & 0xffff_ffff;
    format!(
        "{created:08x}-5e70-4000-8{role_bits:03x}-{:012x}",
        task.id.0 & 0xffff_ffff_ffff
    )
}
