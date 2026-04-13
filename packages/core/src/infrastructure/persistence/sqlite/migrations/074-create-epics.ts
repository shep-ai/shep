import type { MigrationParams } from 'umzug';
import type Database from 'better-sqlite3';

export async function up({ context: db }: MigrationParams<Database.Database>): Promise<void> {
  const existingTables = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='epics'")
    .all() as { name: string }[];

  if (existingTables.length === 0) {
    db.exec(`
      CREATE TABLE epics (
        id          TEXT PRIMARY KEY,
        project_id  TEXT NOT NULL,
        name        TEXT NOT NULL,
        description TEXT,
        status      TEXT NOT NULL DEFAULT 'Backlog',
        start_date  INTEGER,
        end_date    INTEGER,
        created_at  INTEGER NOT NULL,
        updated_at  INTEGER NOT NULL,
        deleted_at  INTEGER,
        FOREIGN KEY (project_id) REFERENCES pm_projects(id)
      )
    `);

    db.exec('CREATE INDEX idx_epics_project_id ON epics(project_id)');
  }
}

export async function down({ context: db }: MigrationParams<Database.Database>): Promise<void> {
  db.exec('DROP TABLE IF EXISTS epics');
}
