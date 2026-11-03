//! SQLite storage. The daemon is the main writer; the CLI writes directly only while no
//! daemon runs, so the file is opened in WAL mode with a busy timeout.

mod migrations;
mod settings;
mod tasks;

use std::path::Path;
use std::sync::Mutex;
use std::time::Duration;

use rusqlite::Connection;
use shep_app::StoreError;

const BUSY_TIMEOUT: Duration = Duration::from_secs(5);

pub struct SqliteStore {
    conn: Mutex<Connection>,
}

impl SqliteStore {
    /// Opens (or creates) the database and brings its schema up to date.
    pub fn open(path: &Path) -> Result<Self, StoreError> {
        if let Some(dir) = path.parent() {
            std::fs::create_dir_all(dir).map_err(err)?;
        }
        let mut conn = Connection::open(path).map_err(err)?;
        conn.busy_timeout(BUSY_TIMEOUT).map_err(err)?;
        conn.pragma_update(None, "journal_mode", "WAL")
            .map_err(err)?;
        migrations::run(&mut conn).map_err(err)?;
        Ok(Self {
            conn: Mutex::new(conn),
        })
    }

    pub(crate) fn with<R>(
        &self,
        f: impl FnOnce(&Connection) -> rusqlite::Result<R>,
    ) -> Result<R, StoreError> {
        let conn = self
            .conn
            .lock()
            .map_err(|_| StoreError("database lock poisoned".into()))?;
        f(&conn).map_err(err)
    }
}

pub(crate) fn to_json<T: serde::Serialize>(value: &T) -> String {
    serde_json::to_string(value).unwrap_or_default()
}

pub(crate) fn from_json<T: serde::de::DeserializeOwned>(
    col: usize,
    text: &str,
) -> rusqlite::Result<T> {
    serde_json::from_str(text).map_err(|e| {
        rusqlite::Error::FromSqlConversionFailure(col, rusqlite::types::Type::Text, Box::new(e))
    })
}

/// An optional JSON column.
pub(crate) fn from_json_opt<T: serde::de::DeserializeOwned>(
    col: usize,
    text: Option<String>,
) -> rusqlite::Result<Option<T>> {
    text.map(|t| from_json(col, &t)).transpose()
}

pub(crate) fn err(e: impl std::fmt::Display) -> StoreError {
    StoreError(e.to_string())
}
