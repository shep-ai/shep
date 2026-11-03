use shep_domain::{SettingsError, SourceRefError, TaskId, TransitionError};

use crate::ports::{ForgeError, GitError};
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
    #[error(transparent)]
    Forge(#[from] ForgeError),
    #[error(transparent)]
    Git(#[from] GitError),
    /// Something must be set up before work can start; the message says what to run.
    #[error("{0}")]
    NotReady(String),
    /// The daemon answered with an error, or could not be reached. The message is already
    /// written for a person.
    #[error("{0}")]
    Remote(String),
}
