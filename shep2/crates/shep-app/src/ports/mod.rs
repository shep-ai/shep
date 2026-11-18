//! What the application needs from the outside world. Implemented in `shep-infra`; in-memory
//! fakes live in [`crate::testing`].

mod agents;
mod forge;
mod git;
mod sources;
mod store;
mod system;

use std::sync::Arc;

pub use agents::{
    AgentCommand, AgentProvider, AgentProviders, AgentRequest, AgentSessions, AgentView,
    SessionError, SessionSpec, SessionState,
};
pub use forge::{Forge, ForgeError, Issue, IssueRef, IssueState, PrComment};
pub use git::{BaseUpdate, Git, GitError, RepoInfo};
pub use sources::{
    FormField, HandOver, Prefill, Reply, SourceError, SourceForm, SourceProviders, TaskSource,
    Update,
};
pub use store::{
    EventLog, Mark, Marks, RunRepository, SettingsRepository, StoreError, TaskRepository,
};
pub use system::{Clock, FilesError, KeepAwake, TaskFiles};

/// Everything Shep reaches the outside world through. One store may serve several ports (the
/// daemon holds a single database connection).
#[derive(Clone)]
pub struct Ports {
    pub tasks: Arc<dyn TaskRepository>,
    pub settings: Arc<dyn SettingsRepository>,
    pub runs: Arc<dyn RunRepository>,
    pub events: Arc<dyn EventLog>,
    pub marks: Arc<dyn Marks>,
    pub clock: Arc<dyn Clock>,
    pub git: Arc<dyn Git>,
    pub forge: Arc<dyn Forge>,
    pub agents: Arc<dyn AgentProviders>,
    pub sessions: Arc<dyn AgentSessions>,
    pub files: Arc<dyn TaskFiles>,
    pub awake: Arc<dyn KeepAwake>,
    pub sources: Arc<dyn SourceProviders>,
}
