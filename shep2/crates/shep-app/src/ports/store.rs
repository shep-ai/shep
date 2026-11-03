use shep_domain::{Run, Settings, Task, TaskEvent, TaskId, TaskSourceRef, UnixTime};

#[derive(Debug, Clone, PartialEq, Eq, thiserror::Error)]
#[error("storage failed: {0}")]
pub struct StoreError(pub String);

pub trait TaskRepository: Send + Sync {
    /// Stores a new queued task and returns it with its id.
    fn create(&self, source: TaskSourceRef, now: UnixTime) -> Result<Task, StoreError>;
    fn get(&self, id: TaskId) -> Result<Option<Task>, StoreError>;
    fn save(&self, task: &Task) -> Result<(), StoreError>;
    fn list(&self) -> Result<Vec<Task>, StoreError>;
}

pub trait SettingsRepository: Send + Sync {
    /// Returns the defaults when nothing has been saved yet.
    fn load_settings(&self) -> Result<Settings, StoreError>;
    fn save_settings(&self, settings: &Settings) -> Result<(), StoreError>;
}

/// Where each task's run stands. One run per task.
pub trait RunRepository: Send + Sync {
    fn load_run(&self, task: TaskId) -> Result<Option<Run>, StoreError>;
    fn save_run(&self, run: &Run) -> Result<(), StoreError>;
}

/// What happened, in order.
pub trait EventLog: Send + Sync {
    fn record(&self, event: &TaskEvent) -> Result<(), StoreError>;
    fn events(&self, task: TaskId) -> Result<Vec<TaskEvent>, StoreError>;
}
