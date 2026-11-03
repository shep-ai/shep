//! Shep 2 domain: one thing (a task), five states, the sources a task can come from, the
//! review decisions a person makes, and the run that carries a task from Working to Ready.
//! No I/O.

mod agent_status;
mod branch;
mod event;
mod run;
mod settings;
mod source;
mod task;
mod task_state;

pub use agent_status::{AgentStatus, BlockKind, ResetAt};
pub use branch::{check_push, PushRefused, TaskBranch, TASK_BRANCH_PREFIX};
pub use event::{CheckState, CiCheck, CiVerdict, EventKind, TaskEvent};
pub use run::{
    conversation_id, AgentJob, ConversationRole, Run, RunStep, SessionId, Worktree, MAX_CI_FIXES,
};
pub use settings::{AgentKind, ClockTime, Settings, SettingsError};
pub use source::{SourceKind, SourceRefError, TaskSourceRef};
pub use task::{PullRequest, ReviewAction, Task, TaskId, UnixTime};
pub use task_state::{TaskState, TransitionError};
