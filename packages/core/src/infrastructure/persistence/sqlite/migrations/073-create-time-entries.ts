import type { MigrationParams } from 'umzug';
import type Database from 'better-sqlite3';

export async function up({ context: db }: MigrationParams<Database.Database>): Promise<void> {
  const existingTables = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='time_entries'")
    .all() as { name: string }[];

  if (existingTables.length === 0) {
    db.exec(`
      CREATE TABLE time_entries (
        id               TEXT PRIMARY KEY,
        work_item_id     TEXT NOT NULL,
        duration_minutes INTEGER NOT NULL,
        note             TEXT,
        logged_at        INTEGER NOT NULL,
        created_at       INTEGER NOT NULL,
        updated_at       INTEGER NOT NULL,
        FOREIGN KEY (work_item_id) REFERENCES work_items(id)
      )
    `);

    db.exec('CREATE INDEX idx_time_entries_work_item_id ON time_entries(work_item_id)');
    db.exec('CREATE INDEX idx_time_entries_logged_at ON time_entries(logged_at)');
  }
}

export async function down({ context: db }: MigrationParams<Database.Database>): Promise<void> {
  db.exec('DROP TABLE IF EXISTS time_entries');
}
