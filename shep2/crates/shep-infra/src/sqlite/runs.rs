use rusqlite::{params, OptionalExtension};
use shep_app::ports::{EventLog, RunRepository};
use shep_app::StoreError;
use shep_domain::{Run, TaskEvent, TaskId, UnixTime};

use super::{from_json, to_json, SqliteStore};

impl RunRepository for SqliteStore {
    fn load_run(&self, task: TaskId) -> Result<Option<Run>, StoreError> {
        self.with(|c| {
            c.query_row("SELECT run FROM runs WHERE task_id = ?1", [task.0], |r| {
                from_json(0, &r.get::<_, String>(0)?)
            })
            .optional()
        })
    }

    fn save_run(&self, run: &Run) -> Result<(), StoreError> {
        self.with(|c| {
            c.execute(
                "INSERT INTO runs (task_id, run, updated_at) VALUES (?1, ?2, ?3)
                 ON CONFLICT(task_id) DO UPDATE SET run = excluded.run,
                   updated_at = excluded.updated_at",
                params![run.task_id.0, to_json(run), run.updated_at.0],
            )
        })
        .map(|_| ())
    }
}

impl EventLog for SqliteStore {
    fn record(&self, event: &TaskEvent) -> Result<(), StoreError> {
        self.with(|c| {
            c.execute(
                "INSERT INTO events (task_id, at, kind, detail) VALUES (?1, ?2, ?3, ?4)",
                params![
                    event.task_id.0,
                    event.at.0,
                    to_json(&event.kind),
                    event.detail
                ],
            )
        })
        .map(|_| ())
    }

    fn events(&self, task: TaskId) -> Result<Vec<TaskEvent>, StoreError> {
        self.with(|c| {
            let mut stmt = c.prepare(
                "SELECT task_id, at, kind, detail FROM events WHERE task_id = ?1 ORDER BY id",
            )?;
            let rows = stmt.query_map([task.0], |r| {
                Ok(TaskEvent {
                    task_id: TaskId(r.get(0)?),
                    at: UnixTime(r.get(1)?),
                    kind: from_json(2, &r.get::<_, String>(2)?)?,
                    detail: r.get(3)?,
                })
            })?;
            rows.collect()
        })
    }
}
