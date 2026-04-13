import type { MigrationParams } from 'umzug';
import type Database from 'better-sqlite3';

export async function up({ context: db }: MigrationParams<Database.Database>): Promise<void> {
  const existingTables = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='pm_attachments'")
    .all() as { name: string }[];

  if (existingTables.length === 0) {
    db.exec(`
      CREATE TABLE pm_attachments (
        id           TEXT PRIMARY KEY,
        work_item_id TEXT NOT NULL,
        filename     TEXT NOT NULL,
        mime_type    TEXT NOT NULL,
        file_size    INTEGER NOT NULL,
        storage_path TEXT NOT NULL,
        created_at   INTEGER NOT NULL,
        updated_at   INTEGER NOT NULL,
        deleted_at   INTEGER,
        FOREIGN KEY (work_item_id) REFERENCES work_items(id)
      )
    `);

    db.exec('CREATE INDEX idx_pm_attachments_work_item_id ON pm_attachments(work_item_id)');
  }
}

export async function down({ context: db }: MigrationParams<Database.Database>): Promise<void> {
  db.exec('DROP TABLE IF EXISTS pm_attachments');
}
