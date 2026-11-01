//! SQLite storage for tasks and settings. The daemon is the only writer.

use std::path::Path;
use std::sync::Mutex;

use rusqlite::{params, Connection, OptionalExtension, Row};
use shep_app::{SettingsRepository, StoreError, TaskRepository};
use shep_domain::{Settings, Task, TaskId, TaskSourceRef, TaskState, UnixTime};

const SCHEMA_VERSION: i64 = 1;
const SETTINGS_KEY: &str = "settings";
const TASK_COLUMNS: &str = "id, title, source, state, question, note, created_at, updated_at";

const SCHEMA_V1: &str = "
CREATE TABLE IF NOT EXISTS tasks (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  title       TEXT NOT NULL,
  source      TEXT NOT NULL,
  state       TEXT NOT NULL,
  question    TEXT,
  note        TEXT,
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS settings (
  key    TEXT PRIMARY KEY,
  value  TEXT NOT NULL
);";

pub struct SqliteStore {
    conn: Mutex<Connection>,
}

impl SqliteStore {
    /// Opens (or creates) the database and brings its schema up to date.
    pub fn open(path: &Path) -> Result<Self, StoreError> {
        if let Some(dir) = path.parent() {
            std::fs::create_dir_all(dir).map_err(err)?;
        }
        let conn = Connection::open(path).map_err(err)?;
        let version: i64 = conn
            .query_row("PRAGMA user_version", [], |r| r.get(0))
            .map_err(err)?;
        if version < SCHEMA_VERSION {
            conn.execute_batch(SCHEMA_V1).map_err(err)?;
            conn.pragma_update(None, "user_version", SCHEMA_VERSION)
                .map_err(err)?;
        }
        Ok(Self {
            conn: Mutex::new(conn),
        })
    }

    fn with<R>(&self, f: impl FnOnce(&Connection) -> rusqlite::Result<R>) -> Result<R, StoreError> {
        let conn = self
            .conn
            .lock()
            .map_err(|_| StoreError("database lock poisoned".into()))?;
        f(&conn).map_err(err)
    }
}

impl TaskRepository for SqliteStore {
    fn create(&self, source: TaskSourceRef, now: UnixTime) -> Result<Task, StoreError> {
        let draft = Task::new(TaskId(0), source, now);
        let id = self.with(|c| {
            c.execute(
                "INSERT INTO tasks (title, source, state, question, note, created_at, updated_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
                params![
                    draft.title,
                    to_json(&draft.source),
                    state_to_text(draft.state),
                    draft.question,
                    draft.note,
                    draft.created_at.0,
                    draft.updated_at.0
                ],
            )?;
            Ok(c.last_insert_rowid())
        })?;
        Ok(Task {
            id: TaskId(id),
            ..draft
        })
    }

    fn get(&self, id: TaskId) -> Result<Option<Task>, StoreError> {
        self.with(|c| {
            c.query_row(
                &format!("SELECT {TASK_COLUMNS} FROM tasks WHERE id = ?1"),
                [id.0],
                row_to_task,
            )
            .optional()
        })
    }

    fn save(&self, task: &Task) -> Result<(), StoreError> {
        let changed = self.with(|c| {
            c.execute(
                "UPDATE tasks SET title = ?2, source = ?3, state = ?4, question = ?5, note = ?6,
                 created_at = ?7, updated_at = ?8 WHERE id = ?1",
                params![
                    task.id.0,
                    task.title,
                    to_json(&task.source),
                    state_to_text(task.state),
                    task.question,
                    task.note,
                    task.created_at.0,
                    task.updated_at.0
                ],
            )
        })?;
        if changed == 0 {
            return Err(StoreError(format!("no task {}", task.id)));
        }
        Ok(())
    }

    fn list(&self) -> Result<Vec<Task>, StoreError> {
        self.with(|c| {
            let mut stmt = c.prepare(&format!("SELECT {TASK_COLUMNS} FROM tasks ORDER BY id"))?;
            let rows = stmt.query_map([], row_to_task)?;
            rows.collect()
        })
    }
}

impl SettingsRepository for SqliteStore {
    fn load_settings(&self) -> Result<Settings, StoreError> {
        let stored: Option<String> = self.with(|c| {
            c.query_row(
                "SELECT value FROM settings WHERE key = ?1",
                [SETTINGS_KEY],
                |r| r.get(0),
            )
            .optional()
        })?;
        stored.map_or_else(
            || Ok(Settings::default()),
            |json| serde_json::from_str(&json).map_err(err),
        )
    }

    fn save_settings(&self, settings: &Settings) -> Result<(), StoreError> {
        let json = to_json(settings);
        self.with(|c| {
            c.execute(
                "INSERT INTO settings (key, value) VALUES (?1, ?2)
                 ON CONFLICT(key) DO UPDATE SET value = excluded.value",
                params![SETTINGS_KEY, json],
            )
        })
        .map(|_| ())
    }
}

fn row_to_task(row: &Row<'_>) -> rusqlite::Result<Task> {
    let source: String = row.get(2)?;
    let state: String = row.get(3)?;
    Ok(Task {
        id: TaskId(row.get(0)?),
        title: row.get(1)?,
        source: serde_json::from_str(&source).map_err(|e| conversion_err(2, e))?,
        state: state_from_text(&state).map_err(|e| conversion_err(3, e))?,
        question: row.get(4)?,
        note: row.get(5)?,
        created_at: UnixTime(row.get(6)?),
        updated_at: UnixTime(row.get(7)?),
    })
}

/// States are stored by their enum name, through serde, so the mapping lives in one place.
fn state_to_text(state: TaskState) -> String {
    serde_json::to_value(state)
        .ok()
        .and_then(|v| v.as_str().map(str::to_owned))
        .unwrap_or_default()
}

fn state_from_text(text: &str) -> Result<TaskState, serde_json::Error> {
    serde_json::from_value(serde_json::Value::String(text.to_owned()))
}

fn to_json<T: serde::Serialize>(value: &T) -> String {
    serde_json::to_string(value).unwrap_or_default()
}

fn conversion_err(col: usize, e: serde_json::Error) -> rusqlite::Error {
    rusqlite::Error::FromSqlConversionFailure(col, rusqlite::types::Type::Text, Box::new(e))
}

fn err(e: impl std::fmt::Display) -> StoreError {
    StoreError(e.to_string())
}
