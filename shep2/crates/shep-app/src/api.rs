use std::path::Path;

use shep_domain::{ReviewAction, Settings, Task, TaskId};

use crate::{AppError, Board, SettingsChange, StartOutcome, StartWhen};

/// The calls every surface makes: the four core actions plus reading and changing settings.
///
/// [`crate::Shep`] answers them in-process; the daemon client answers them over the socket.
/// A surface holds a `&dyn ShepApi` and never knows which one it has.
pub trait ShepApi: Send + Sync {
    /// Queues a task from an issue reference, a link, or a sentence. `from_dir` is where the
    /// person was when they added it: the first time, Shep starts working in that repository.
    fn add(&self, input: &str, from_dir: Option<&Path>) -> Result<Task, AppError>;
    /// Starts queued tasks now, or sets when tonight's shift starts.
    fn start(&self, when: StartWhen) -> Result<StartOutcome, AppError>;
    /// Every task, grouped by state in review order.
    fn board(&self) -> Result<Board, AppError>;
    /// A person's decision: merge, send back with a note, or answer a question.
    fn review(&self, id: TaskId, action: ReviewAction) -> Result<Task, AppError>;
    fn settings(&self) -> Result<Settings, AppError>;
    fn update_settings(&self, change: SettingsChange) -> Result<Settings, AppError>;
}
