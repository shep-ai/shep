use std::path::Path;

use shep_domain::{ReviewAction, Settings, Task, TaskId};

use crate::ports::AgentView;
use crate::view::{Brief, Setup, TaskDetail};
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

    /// One task in full: its run, a line on what it is doing, CI, diff, proof, review.
    fn detail(&self, id: TaskId) -> Result<TaskDetail, AppError>;
    /// What finished, what needs you, and how the night went.
    fn brief(&self) -> Result<Brief, AppError>;
    /// The brief, once per morning: only when there is news since it was last shown.
    fn morning_brief(&self) -> Result<Option<Brief>, AppError>;
    /// True once per local day (the splash plays only then).
    fn first_run_today(&self) -> Result<bool, AppError>;
    /// Queues every open issue with this label that is not on the board yet.
    fn add_label(&self, label: &str, from_dir: Option<&Path>) -> Result<Vec<Task>, AppError>;
    /// The task's live agent terminal, to watch.
    fn watch_agent(&self, id: TaskId) -> Result<Box<dyn AgentView>, AppError>;
    /// Types into the task's agent ("attach").
    fn send_to_agent(&self, id: TaskId, bytes: &[u8]) -> Result<(), AppError>;
    /// What is installed, signed in and chosen, for onboarding and `shep config`.
    fn setup(&self, from_dir: Option<&Path>) -> Result<Setup, AppError>;
}
