//! Shep 2 application layer. Every surface (CLI, terminal UI, MCP, Mac app) calls the same four
//! core actions through [`ShepApi`]: `add`, `start`, `board` and `review`. [`Shep`] answers them
//! in-process; storage and time come in through the port traits in [`ports`].

mod api;
mod board;
mod engine;
mod error;
pub mod ports;
mod shep;
#[cfg(feature = "testing")]
pub mod testing;

pub use api::ShepApi;
pub use board::Board;
pub use engine::{
    Engine, EngineConfig, AGENT_ENV_PROOF_DIR, AGENT_ENV_QUESTION_FILE, AGENT_ENV_REVIEW_FILE,
    AGENT_ENV_TASK,
};
pub use error::AppError;
pub use ports::{Clock, Ports, SettingsRepository, StoreError, TaskRepository};
pub use shep::{SettingsChange, Shep, StartOutcome, StartWhen};
