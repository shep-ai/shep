use shep_domain::{SettingsError, SourceRefError, TaskId, TransitionError};

use crate::StoreError;

#[derive(Debug, Clone, PartialEq, Eq, thiserror::Error)]
pub enum AppError {
    #[error("no task {0}")]
    NotFound(TaskId),
    #[error(transparent)]
    Source(#[from] SourceRefError),
    #[error(transparent)]
    Transition(#[from] TransitionError),
    #[error(transparent)]
    Settings(#[from] SettingsError),
    #[error(transparent)]
    Store(#[from] StoreError),
    /// The daemon answered with an error, or could not be reached. The message is already
    /// written for a person.
    #[error("{0}")]
    Remote(String),
}
