import type { MigrationParams } from 'umzug';
import type Database from 'better-sqlite3';

export async function up({ context: db }: MigrationParams<Database.Database>): Promise<void> {
  // Check if epic_id column already exists on work_items
  const columns = db.pragma('table_info(work_items)') as { name: string }[];
  const hasEpicId = columns.some((c) => c.name === 'epic_id');

  if (!hasEpicId) {
    db.exec('ALTER TABLE work_items ADD COLUMN epic_id TEXT REFERENCES epics(id)');
    db.exec('CREATE INDEX idx_work_items_epic_id ON work_items(epic_id)');
  }
}

export async function down({ context: _db }: MigrationParams<Database.Database>): Promise<void> {
  // SQLite does not support DROP COLUMN in older versions; leave column in place
}
