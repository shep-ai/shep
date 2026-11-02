//! What the application needs from the outside world. Implemented in `shep-infra`.

use shep_domain::{Settings, Task, TaskId, TaskSourceRef, UnixTime};

#[derive(Debug, Clone, PartialEq, Eq, thiserror::Error)]
#[error("storage failed: {0}")]
pub struct StoreError(pub String);

pub trait TaskRepository {
    /// Stores a new queued task and returns it with its id.
    fn create(&self, source: TaskSourceRef, now: UnixTime) -> Result<Task, StoreError>;
    fn get(&self, id: TaskId) -> Result<Option<Task>, StoreError>;
    fn save(&self, task: &Task) -> Result<(), StoreError>;
    fn list(&self) -> Result<Vec<Task>, StoreError>;
}

pub trait SettingsRepository {
    /// Returns the defaults when nothing has been saved yet.
    fn load_settings(&self) -> Result<Settings, StoreError>;
    fn save_settings(&self, settings: &Settings) -> Result<(), StoreError>;
}

pub trait Clock {
    fn now(&self) -> UnixTime;
}

/// One shared store can serve both ports (the daemon holds a single database connection).
impl<R: TaskRepository + ?Sized> TaskRepository for std::sync::Arc<R> {
    fn create(&self, source: TaskSourceRef, now: UnixTime) -> Result<Task, StoreError> {
        (**self).create(source, now)
    }
    fn get(&self, id: TaskId) -> Result<Option<Task>, StoreError> {
        (**self).get(id)
    }
    fn save(&self, task: &Task) -> Result<(), StoreError> {
        (**self).save(task)
    }
    fn list(&self) -> Result<Vec<Task>, StoreError> {
        (**self).list()
    }
}

impl<R: SettingsRepository + ?Sized> SettingsRepository for std::sync::Arc<R> {
    fn load_settings(&self) -> Result<Settings, StoreError> {
        (**self).load_settings()
    }
    fn save_settings(&self, settings: &Settings) -> Result<(), StoreError> {
        (**self).save_settings(settings)
    }
}
