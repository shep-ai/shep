use rusqlite::{params, OptionalExtension};
use shep_app::ports::{Mark, Marks};
use shep_app::{SettingsRepository, StoreError};
use shep_domain::{Settings, UnixTime};

use super::{err, to_json, SqliteStore};

const SETTINGS_KEY: &str = "settings";

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

/// Marks share the settings table, under keys that cannot clash with `settings`.
const MARK_PREFIX: &str = "mark.";

impl Marks for SqliteStore {
    fn mark(&self, mark: Mark) -> Result<Option<UnixTime>, StoreError> {
        let key = format!("{MARK_PREFIX}{}", mark.key());
        let stored: Option<String> = self.with(|c| {
            c.query_row("SELECT value FROM settings WHERE key = ?1", [key], |r| {
                r.get(0)
            })
            .optional()
        })?;
        Ok(stored.and_then(|v| v.parse().ok()).map(UnixTime))
    }

    fn set_mark(&self, mark: Mark, at: UnixTime) -> Result<(), StoreError> {
        let key = format!("{MARK_PREFIX}{}", mark.key());
        self.with(|c| {
            c.execute(
                "INSERT INTO settings (key, value) VALUES (?1, ?2)
                 ON CONFLICT(key) DO UPDATE SET value = excluded.value",
                params![key, at.0.to_string()],
            )
        })
        .map(|_| ())
    }
}
