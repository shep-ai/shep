import type { MigrationParams } from 'umzug';
import type Database from 'better-sqlite3';

export async function up({ context: db }: MigrationParams<Database.Database>): Promise<void> {
  const existingTables = db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('pm_modules', 'module_work_items')"
    )
    .all() as { name: string }[];
  const tableNames = new Set(existingTables.map((t) => t.name));

  if (!tableNames.has('pm_modules')) {
    db.exec(`
      CREATE TABLE pm_modules (
        id          TEXT PRIMARY KEY,
        project_id  TEXT NOT NULL,
        name        TEXT NOT NULL,
        description TEXT,
        status      TEXT NOT NULL DEFAULT 'Backlog',
        lead_id     TEXT,
        start_date  INTEGER,
        end_date    INTEGER,
        created_at  INTEGER NOT NULL,
        updated_at  INTEGER NOT NULL,
        deleted_at  INTEGER,
        FOREIGN KEY (project_id) REFERENCES pm_projects(id)
      )
    `);

    db.exec('CREATE INDEX idx_pm_modules_project_id ON pm_modules(project_id)');
  }

  if (!tableNames.has('module_work_items')) {
    db.exec(`
      CREATE TABLE module_work_items (
        module_id    TEXT NOT NULL,
        work_item_id TEXT NOT NULL,
        PRIMARY KEY (module_id, work_item_id),
        FOREIGN KEY (module_id) REFERENCES pm_modules(id),
        FOREIGN KEY (work_item_id) REFERENCES work_items(id)
      )
    `);
  }
}

export async function down({ context: db }: MigrationParams<Database.Database>): Promise<void> {
  db.exec('DROP TABLE IF EXISTS module_work_items');
  db.exec('DROP TABLE IF EXISTS pm_modules');
}
