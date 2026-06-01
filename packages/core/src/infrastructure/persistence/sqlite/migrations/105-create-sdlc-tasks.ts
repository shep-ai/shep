/**
 * Migration 105: Create sdlc_tasks table (SDLC Kanban Board — Phase 2).
 *
 * First-class persisted SDLC task entities. Each row represents one task
 * within a feature (epic), keyed by (feature_id, task_key) for idempotent
 * seeding from agent plan output.
 *
 * Columns:
 *  - id               TEXT PK (UUID)
 *  - feature_id       TEXT NOT NULL — FK to features (epic)
 *  - task_key         TEXT NOT NULL — stable idempotency key within a feature
 *  - title            TEXT NOT NULL
 *  - description      TEXT — optional rich text
 *  - status           TEXT NOT NULL — TaskState enum value
 *  - sort_order       REAL NOT NULL — float64 for fractional indexing
 *  - branch           TEXT — optional git branch name
 *  - depends_on_keys  TEXT — JSON array of task_keys this task depends on
 *  - agent_run_id     TEXT — optional FK to agent_runs
 *  - created_at       INTEGER NOT NULL (unix ms)
 *  - updated_at       INTEGER NOT NULL (unix ms)
 *
 * Indexes:
 *  - unique (feature_id, task_key) — idempotency / upsert target
 *  - non-unique (feature_id)       — listByFeature / listAllActive lookups
 */

import type { MigrationParams } from 'umzug';
import type Database from 'better-sqlite3';

export async function up({ context: db }: MigrationParams<Database.Database>): Promise<void> {
  const tables = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='sdlc_tasks'")
    .all() as { name: string }[];

  if (tables.length === 0) {
    db.exec(`
      CREATE TABLE sdlc_tasks (
        id               TEXT PRIMARY KEY,
        feature_id       TEXT NOT NULL,
        task_key         TEXT NOT NULL,
        title            TEXT NOT NULL,
        description      TEXT,
        status           TEXT NOT NULL,
        sort_order       REAL NOT NULL,
        branch           TEXT,
        depends_on_keys  TEXT,
        agent_run_id     TEXT,
        created_at       INTEGER NOT NULL,
        updated_at       INTEGER NOT NULL
      )
    `);
  }

  const indexes = db.pragma('index_list(sdlc_tasks)') as { name: string }[];
  const indexNames = new Set(indexes.map((i) => i.name));

  if (!indexNames.has('idx_sdlc_tasks_unique_feature_task_key')) {
    db.exec(
      'CREATE UNIQUE INDEX idx_sdlc_tasks_unique_feature_task_key ON sdlc_tasks(feature_id, task_key)'
    );
  }
  if (!indexNames.has('idx_sdlc_tasks_feature_id')) {
    db.exec('CREATE INDEX idx_sdlc_tasks_feature_id ON sdlc_tasks(feature_id)');
  }
}

export async function down({ context: db }: MigrationParams<Database.Database>): Promise<void> {
  db.exec('DROP TABLE IF EXISTS sdlc_tasks');
}
