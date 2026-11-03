//! In-memory fakes for every port. Enabled with the `testing` feature; used by this crate's
//! tests and by the surfaces' tests.

mod agents;
mod repo;
mod store;
mod system;

use std::sync::Arc;

pub use agents::{FakeAgents, FakeProvider, FakeSessions};
pub use repo::{FakeForge, FakeGit};
pub use store::{ManualClock, MemoryEvents, MemoryRuns, MemorySettings, MemoryTasks};
pub use system::{FakeAwake, MemoryFiles};

use crate::Ports;

/// One set of fakes, kept so a test can inspect them after handing [`Ports`] to the code.
pub struct Fakes {
    pub tasks: Arc<MemoryTasks>,
    pub settings: Arc<MemorySettings>,
    pub runs: Arc<MemoryRuns>,
    pub events: Arc<MemoryEvents>,
    pub clock: Arc<ManualClock>,
    pub git: Arc<FakeGit>,
    pub forge: Arc<FakeForge>,
    pub agents: Arc<FakeAgents>,
    pub sessions: Arc<FakeSessions>,
    pub files: Arc<MemoryFiles>,
    pub awake: Arc<FakeAwake>,
}

impl Default for Fakes {
    fn default() -> Self {
        Self {
            tasks: Arc::default(),
            settings: Arc::default(),
            runs: Arc::default(),
            events: Arc::default(),
            clock: Arc::new(ManualClock::ticking(1000)),
            git: Arc::default(),
            forge: Arc::default(),
            agents: Arc::default(),
            sessions: Arc::default(),
            files: Arc::default(),
            awake: Arc::default(),
        }
    }
}

impl Fakes {
    pub fn ports(&self) -> Ports {
        Ports {
            tasks: self.tasks.clone(),
            settings: self.settings.clone(),
            runs: self.runs.clone(),
            events: self.events.clone(),
            clock: self.clock.clone(),
            git: self.git.clone(),
            forge: self.forge.clone(),
            agents: self.agents.clone(),
            sessions: self.sessions.clone(),
            files: self.files.clone(),
            awake: self.awake.clone(),
        }
    }
}

/// Locks a fake's state; a poisoned lock means an earlier assertion already failed.
fn lock<T>(m: &std::sync::Mutex<T>) -> std::sync::MutexGuard<'_, T> {
    m.lock().unwrap_or_else(std::sync::PoisonError::into_inner)
}
