//! Shep 2 infrastructure adapters.

mod agents;
mod awake;
mod clock;
mod files;
mod gh;
mod git;
pub mod holder;
mod home;
pub mod osc;
mod process;
mod sqlite;

pub use agents::CliAgents;
pub use awake::{inhibitor_command, SystemKeepAwake};
pub use clock::SystemClock;
pub use files::FsTaskFiles;
pub use gh::GhForge;
pub use git::GitCli;
pub use holder::HolderSessions;
pub use home::{ShepHome, MAX_SOCKET_PATH, SHEP_HOME_ENV};
pub use process::{spawn_detached, wait_until};
pub use sqlite::SqliteStore;
