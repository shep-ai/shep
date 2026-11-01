//! Shep 2 infrastructure adapters.

mod clock;
mod sqlite;

pub use clock::SystemClock;
pub use sqlite::SqliteStore;
