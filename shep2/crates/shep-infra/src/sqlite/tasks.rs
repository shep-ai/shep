use rusqlite::{params, OptionalExtension, Row};
use shep_app::{StoreError, TaskRepository};
use shep_domain::{Task, TaskId, TaskSourceRef, TaskState, UnixTime};

use super::{from_json, from_json_opt, to_json, SqliteStore};

const TASK_COLUMNS: &str = "id, title, source, state, question, note, created_at, updated_at, pr";

impl TaskRepository for SqliteStore {
    fn create(&self, source: TaskSourceRef, now: UnixTime) -> Result<Task, StoreError> {
        let draft = Task::new(TaskId(0), source, now);
        let id = self.with(|c| {
            c.execute(
                "INSERT INTO tasks (title, source, state, question, note, created_at, updated_at, pr)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
                params![
                    draft.title,
                    to_json(&draft.source),
                    state_to_text(draft.state),
                    draft.question,
                    draft.note,
                    draft.created_at.0,
                    draft.updated_at.0,
                    draft.pr.as_ref().map(to_json),
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
                 created_at = ?7, updated_at = ?8, pr = ?9 WHERE id = ?1",
                params![
                    task.id.0,
                    task.title,
                    to_json(&task.source),
                    state_to_text(task.state),
                    task.question,
                    task.note,
                    task.created_at.0,
                    task.updated_at.0,
                    task.pr.as_ref().map(to_json),
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

fn row_to_task(row: &Row<'_>) -> rusqlite::Result<Task> {
    let source: String = row.get(2)?;
    let state: String = row.get(3)?;
    Ok(Task {
        id: TaskId(row.get(0)?),
        title: row.get(1)?,
        source: from_json(2, &source)?,
        state: from_json(3, &to_json(&state))?,
        question: row.get(4)?,
        note: row.get(5)?,
        created_at: UnixTime(row.get(6)?),
        updated_at: UnixTime(row.get(7)?),
        pr: from_json_opt(8, row.get(8)?)?,
    })
}

/// States are stored by their enum name, through serde, so the mapping lives in one place.
fn state_to_text(state: TaskState) -> String {
    serde_json::to_value(state)
        .ok()
        .and_then(|v| v.as_str().map(str::to_owned))
        .unwrap_or_default()
}
