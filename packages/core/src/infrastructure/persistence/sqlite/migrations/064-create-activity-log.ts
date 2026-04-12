import type { MigrationParams } from 'umzug';
import type Database from 'better-sqlite3';

/**
 * Migration 064: Activity log table.
 *
 * This table is append-only per NFR-8 — it intentionally has NO deleted_at
 * column. Activity records are never soft-deleted; they form a permanent
 * audit trail for work item changes.
 */
export async function up({ context: db }: MigrationParams<Database.Database>): Promise<void> {
  const tables = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='activity_log'")
    .all() as { name: string }[];

  if (tables.length === 0) {
    db.exec(`
      CREATE TABLE activity_log (
        id           TEXT PRIMARY KEY,
        work_item_id TEXT NOT NULL,
        field_name   TEXT NOT NULL,
        old_value    TEXT,
        new_value    TEXT,
        actor_id     TEXT NOT NULL,
        created_at   INTEGER NOT NULL,
        updated_at   INTEGER NOT NULL,
        FOREIGN KEY (work_item_id) REFERENCES work_items(id)
      )
    `);
  }

  const indexes = db.pragma('index_list(activity_log)') as { name: string }[];
  const indexNames = new Set(indexes.map((i) => i.name));

  if (!indexNames.has('idx_activity_log_work_item_id')) {
    db.exec('CREATE INDEX idx_activity_log_work_item_id ON activity_log(work_item_id)');
  }
}

export async function down({ context: db }: MigrationParams<Database.Database>): Promise<void> {
  db.exec('DROP TABLE IF EXISTS activity_log');
}
