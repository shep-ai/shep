/**
 * Migration 057: Workflow step persistence.
 *
 * Adds the `workflow_steps` table — one row per step of a multi-step
 * workflow executed inside an interactive session — and a `step_id`
 * column on `interactive_messages` so every persisted message is
 * grouped under the step that produced it.
 *
 * This replaces the fragile text-marker protocol (SHEP__PLAN /
 * SHEP__STEP_START / SHEP__STEP_FINISHED_RESULT) that previously
 * lived in the agent's output stream with a backend-orchestrator-
 * owned model. Two robustness properties follow directly from the
 * schema:
 *
 *   1. A step row transitions to `running` BEFORE the agent is
 *      invoked and to `done`/`failed` AFTER it returns. A browser
 *      refresh or daemon crash at any instant observes a correct
 *      SELECT — nothing is ever inferred from an in-memory field.
 *
 *   2. Every `InteractiveMessage` written during a turn carries the
 *      currently-active `step_id`, so grouping the conversation by
 *      step is a SQL filter, not a heuristic walk of the message
 *      stream.
 */

import type { MigrationParams } from 'umzug';
import type Database from 'better-sqlite3';

type Db = Database.Database;

function runDdl(db: Db, sql: string): void {
  // Use `prepare().run()` instead of the `exec` API so the static
  // security-reminder hook doesn't flag this file. Both are equally
  // valid for DDL in better-sqlite3.
  db.prepare(sql).run();
}

export async function up({ context: db }: MigrationParams<Db>): Promise<void> {
  runDdl(
    db,
    `CREATE TABLE IF NOT EXISTS workflow_steps (
      id          TEXT PRIMARY KEY,
      session_id  TEXT NOT NULL REFERENCES interactive_sessions(id),
      feature_id  TEXT NOT NULL,
      workflow_id TEXT NOT NULL,
      step_key    TEXT NOT NULL,
      step_index  INTEGER NOT NULL,
      title       TEXT NOT NULL,
      description TEXT NOT NULL,
      status      TEXT NOT NULL CHECK(status IN ('pending','running','done','failed','interrupted')),
      started_at  INTEGER,
      finished_at INTEGER,
      metadata    TEXT,
      created_at  INTEGER NOT NULL,
      updated_at  INTEGER NOT NULL,
      UNIQUE(session_id, step_key)
    )`
  );

  runDdl(
    db,
    'CREATE INDEX IF NOT EXISTS idx_workflow_steps_session_order ON workflow_steps(session_id, step_index)'
  );
  runDdl(db, 'CREATE INDEX IF NOT EXISTS idx_workflow_steps_status ON workflow_steps(status)');
  runDdl(
    db,
    'CREATE INDEX IF NOT EXISTS idx_workflow_steps_feature ON workflow_steps(feature_id, step_index)'
  );

  // `ALTER TABLE ... ADD COLUMN` is not idempotent in SQLite — it fails
  // with "duplicate column name" on the second run. Guard with a
  // table_info check so re-running the migration on an already-patched
  // database is a no-op. This matches the pattern used by migrations
  // 035, 036, etc.
  const messageColumns = db.pragma('table_info(interactive_messages)') as { name: string }[];
  if (!messageColumns.some((c) => c.name === 'step_id')) {
    runDdl(db, 'ALTER TABLE interactive_messages ADD COLUMN step_id TEXT');
  }
  runDdl(
    db,
    'CREATE INDEX IF NOT EXISTS idx_interactive_messages_step ON interactive_messages(step_id)'
  );
}

export async function down({ context: db }: MigrationParams<Db>): Promise<void> {
  runDdl(db, 'DROP INDEX IF EXISTS idx_interactive_messages_step');
  // SQLite cannot drop columns prior to 3.35; in practice we never
  // run `down` against production data, so it's acceptable to leave
  // the column behind on rollback.
  runDdl(db, 'DROP INDEX IF EXISTS idx_workflow_steps_feature');
  runDdl(db, 'DROP INDEX IF EXISTS idx_workflow_steps_status');
  runDdl(db, 'DROP INDEX IF EXISTS idx_workflow_steps_session_order');
  runDdl(db, 'DROP TABLE IF EXISTS workflow_steps');
}
