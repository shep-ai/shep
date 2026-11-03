//! What the application needs from the outside world. Implemented in `shep-infra`; in-memory
//! fakes live in [`crate::testing`].

mod agents;
mod forge;
mod git;
mod store;
mod system;

use std::sync::Arc;

pub use agents::{
    AgentCommand, AgentProvider, AgentProviders, AgentRequest, AgentSessions, SessionError,
    SessionSpec, SessionState,
};
pub use forge::{Forge, ForgeError, Issue};
pub use git::{Git, GitError};
pub use store::{EventLog, RunRepository, SettingsRepository, StoreError, TaskRepository};
pub use system::{Clock, FilesError, KeepAwake, TaskFiles};

/// Everything Shep reaches the outside world through. One store may serve several ports (the
/// daemon holds a single database connection).
#[derive(Clone)]
pub struct Ports {
    pub tasks: Arc<dyn TaskRepository>,
    pub settings: Arc<dyn SettingsRepository>,
    pub runs: Arc<dyn RunRepository>,
    pub events: Arc<dyn EventLog>,
    pub clock: Arc<dyn Clock>,
    pub git: Arc<dyn Git>,
    pub forge: Arc<dyn Forge>,
    pub agents: Arc<dyn AgentProviders>,
    pub sessions: Arc<dyn AgentSessions>,
    pub files: Arc<dyn TaskFiles>,
    pub awake: Arc<dyn KeepAwake>,
}
