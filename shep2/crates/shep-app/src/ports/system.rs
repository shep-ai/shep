use std::path::{Path, PathBuf};

use shep_domain::{TaskId, UnixTime};

pub trait Clock: Send + Sync {
    fn now(&self) -> UnixTime;
    /// Seconds to add to UTC for the local time of day (the shift start is local).
    fn utc_offset(&self) -> i64 {
        0
    }
}

#[derive(Debug, Clone, PartialEq, Eq, thiserror::Error)]
#[error("{0}")]
pub struct FilesError(pub String);

/// Each task's own folder: prompts, agent logs, the question file, proof, the review.
pub trait TaskFiles: Send + Sync {
    /// The task's folder, created if needed.
    fn task_dir(&self, task: TaskId) -> Result<PathBuf, FilesError>;
    fn read(&self, path: &Path) -> Option<String>;
    fn write(&self, path: &Path, text: &str) -> Result<(), FilesError>;
    fn remove(&self, path: &Path);
    /// The files directly in `dir`, sorted; none if it does not exist.
    fn list(&self, dir: &Path) -> Vec<PathBuf>;
}

/// Keeps the machine from sleeping while a shift runs. Both calls are idempotent.
pub trait KeepAwake: Send + Sync {
    fn hold(&self);
    fn release(&self);
}
