import type { MigrationParams } from 'umzug';
import type Database from 'better-sqlite3';

export async function up({ context: db }: MigrationParams<Database.Database>): Promise<void> {
  const existingTables = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='pm_notifications'")
    .all() as { name: string }[];

  if (existingTables.length === 0) {
    db.exec(`
      CREATE TABLE pm_notifications (
        id              TEXT PRIMARY KEY,
        project_id      TEXT NOT NULL,
        recipient_id    TEXT NOT NULL,
        type            TEXT NOT NULL,
        title           TEXT NOT NULL,
        body            TEXT,
        is_read         INTEGER NOT NULL DEFAULT 0,
        is_archived     INTEGER NOT NULL DEFAULT 0,
        reference_id    TEXT,
        reference_type  TEXT,
        created_at      INTEGER NOT NULL,
        updated_at      INTEGER NOT NULL,
        deleted_at      INTEGER,
        FOREIGN KEY (project_id) REFERENCES pm_projects(id)
      )
    `);

    db.exec(
      'CREATE INDEX idx_pm_notifications_recipient ON pm_notifications(recipient_id, is_read)'
    );
    db.exec('CREATE INDEX idx_pm_notifications_project_id ON pm_notifications(project_id)');
  }
}

export async function down({ context: db }: MigrationParams<Database.Database>): Promise<void> {
  db.exec('DROP TABLE IF EXISTS pm_notifications');
}
