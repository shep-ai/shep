//! Shep 2 domain: one thing (a task), five states, the sources a task can come from and the
//! review decisions a person makes. No I/O.

mod settings;
mod source;
mod task;
mod task_state;

pub use settings::{AgentKind, ClockTime, Settings, SettingsError};
pub use source::{SourceKind, SourceRefError, TaskSourceRef};
pub use task::{PullRequest, ReviewAction, Task, TaskId, UnixTime};
pub use task_state::{TaskState, TransitionError};
