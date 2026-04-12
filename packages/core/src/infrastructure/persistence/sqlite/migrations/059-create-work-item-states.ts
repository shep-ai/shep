import type { MigrationParams } from 'umzug';
import type Database from 'better-sqlite3';

export async function up({ context: db }: MigrationParams<Database.Database>): Promise<void> {
  const tables = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='work_item_states'")
    .all() as { name: string }[];

  if (tables.length === 0) {
    db.exec(`
      CREATE TABLE work_item_states (
        id            TEXT PRIMARY KEY,
        project_id    TEXT NOT NULL,
        name          TEXT NOT NULL,
        color         TEXT NOT NULL,
        display_order INTEGER NOT NULL,
        state_group   TEXT NOT NULL,
        is_default    INTEGER NOT NULL DEFAULT 0,
        created_at    INTEGER NOT NULL,
        updated_at    INTEGER NOT NULL,
        deleted_at    INTEGER,
        FOREIGN KEY (project_id) REFERENCES pm_projects(id)
      )
    `);
  }

  const indexes = db.pragma('index_list(work_item_states)') as { name: string }[];
  const indexNames = new Set(indexes.map((i) => i.name));

  if (!indexNames.has('idx_work_item_states_project_id')) {
    db.exec('CREATE INDEX idx_work_item_states_project_id ON work_item_states(project_id)');
  }
}

export async function down({ context: db }: MigrationParams<Database.Database>): Promise<void> {
  db.exec('DROP TABLE IF EXISTS work_item_states');
}
