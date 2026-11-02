//! Shep 2 application layer. Every surface (CLI, terminal UI, MCP, Mac app) calls the same four
//! core actions on [`Shep`]: `add`, `start`, `board` and `review`. Storage and time come in
//! through the port traits in [`ports`].

mod board;
mod error;
pub mod ports;
mod shep;

pub use board::Board;
pub use error::AppError;
pub use ports::{Clock, SettingsRepository, StoreError, TaskRepository};
pub use shep::{SettingsChange, Shep, StartOutcome, StartWhen};
