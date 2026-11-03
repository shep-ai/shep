use rusqlite::{params, OptionalExtension};
use shep_app::{SettingsRepository, StoreError};
use shep_domain::Settings;

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
