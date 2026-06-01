/**
 * Migration 106: Create sdlc_subtasks table (SDLC Kanban Board — Phase 2).
 *
 * First-class persisted SDLC sub-task entities. Each row represents one
 * sub-task within an SdlcTask, keyed by (task_id, sub_task_key) for
 * idempotent seeding from agent plan output. feature_id is denormalised for
 * efficient board-level queries that group by epic.
 *
 * Columns:
 *  - id            TEXT PK (UUID)
 *  - task_id       TEXT NOT NULL — FK to sdlc_tasks
 *  - feature_id    TEXT NOT NULL — denormalized FK to features (epic)
 *  - sub_task_key  TEXT NOT NULL — stable idempotency key within a task
 *  - name          TEXT NOT NULL
 *  - description   TEXT — optional
 *  - status        TEXT NOT NULL — TaskState enum value
 *  - sort_order    REAL NOT NULL — float64 for fractional indexing
 *  - created_at    INTEGER NOT NULL (unix ms)
 *  - updated_at    INTEGER NOT NULL (unix ms)
 *
 * Indexes:
 *  - unique (task_id, sub_task_key) — idempotency / upsert target
 *  - non-unique (task_id)           — listByTask lookups
 *  - non-unique (feature_id)        — listByFeature lookups
 */

import type { MigrationParams } from 'umzug';
import type Database from 'better-sqlite3';

export async function up({ context: db }: MigrationParams<Database.Database>): Promise<void> {
  const tables = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='sdlc_subtasks'")
    .all() as { name: string }[];

  if (tables.length === 0) {
    db.exec(`
      CREATE TABLE sdlc_subtasks (
        id            TEXT PRIMARY KEY,
        task_id       TEXT NOT NULL,
        feature_id    TEXT NOT NULL,
        sub_task_key  TEXT NOT NULL,
        name          TEXT NOT NULL,
        description   TEXT,
        status        TEXT NOT NULL,
        sort_order    REAL NOT NULL,
        created_at    INTEGER NOT NULL,
        updated_at    INTEGER NOT NULL
      )
    `);
  }

  const indexes = db.pragma('index_list(sdlc_subtasks)') as { name: string }[];
  const indexNames = new Set(indexes.map((i) => i.name));

  if (!indexNames.has('idx_sdlc_subtasks_unique_task_subtask_key')) {
    db.exec(
      'CREATE UNIQUE INDEX idx_sdlc_subtasks_unique_task_subtask_key ON sdlc_subtasks(task_id, sub_task_key)'
    );
  }
  if (!indexNames.has('idx_sdlc_subtasks_task_id')) {
    db.exec('CREATE INDEX idx_sdlc_subtasks_task_id ON sdlc_subtasks(task_id)');
  }
  if (!indexNames.has('idx_sdlc_subtasks_feature_id')) {
    db.exec('CREATE INDEX idx_sdlc_subtasks_feature_id ON sdlc_subtasks(feature_id)');
  }
}

export async function down({ context: db }: MigrationParams<Database.Database>): Promise<void> {
  db.exec('DROP TABLE IF EXISTS sdlc_subtasks');
}
