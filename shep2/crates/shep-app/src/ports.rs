//! What the application needs from the outside world. Implemented in `shep-infra`; in-memory
//! fakes live in [`crate::testing`].

use std::sync::Arc;

use shep_domain::{Settings, Task, TaskId, TaskSourceRef, UnixTime};

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

pub trait Clock: Send + Sync {
    fn now(&self) -> UnixTime;
}

/// Everything [`crate::Shep`] reaches the outside world through. One store may serve several
/// ports (the daemon holds a single database connection).
#[derive(Clone)]
pub struct Ports {
    pub tasks: Arc<dyn TaskRepository>,
    pub settings: Arc<dyn SettingsRepository>,
    pub clock: Arc<dyn Clock>,
}
