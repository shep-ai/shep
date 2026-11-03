//! Ordered schema steps. `PRAGMA user_version` records how many have run; each runs once, in
//! its own transaction.

use rusqlite::Connection;

const STEPS: &[&str] = &[
    // 1: tasks and settings.
    "CREATE TABLE IF NOT EXISTS tasks (
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
     );",
    // 2: the task's draft pull request (JSON).
    "ALTER TABLE tasks ADD COLUMN pr TEXT;",
];

pub fn run(conn: &mut Connection) -> rusqlite::Result<()> {
    let done: usize = conn.query_row("PRAGMA user_version", [], |r| r.get(0))?;
    for (index, step) in STEPS.iter().enumerate().skip(done) {
        let tx = conn.transaction()?;
        tx.execute_batch(step)?;
        tx.pragma_update(None, "user_version", index + 1)?;
        tx.commit()?;
    }
    Ok(())
}
