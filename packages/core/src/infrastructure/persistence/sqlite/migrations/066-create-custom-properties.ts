import type { MigrationParams } from 'umzug';
import type Database from 'better-sqlite3';

export async function up({ context: db }: MigrationParams<Database.Database>): Promise<void> {
  const tables = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='custom_properties'")
    .all() as { name: string }[];

  if (tables.length === 0) {
    db.exec(`
      CREATE TABLE custom_properties (
        id            TEXT PRIMARY KEY,
        project_id    TEXT NOT NULL,
        name          TEXT NOT NULL,
        property_type TEXT NOT NULL,
        options       TEXT,
        is_required   INTEGER NOT NULL DEFAULT 0,
        display_order INTEGER NOT NULL DEFAULT 0,
        created_at    INTEGER NOT NULL,
        updated_at    INTEGER NOT NULL,
        deleted_at    INTEGER,
        FOREIGN KEY (project_id) REFERENCES pm_projects(id)
      )
    `);
  }

  const indexes = db.pragma('index_list(custom_properties)') as { name: string }[];
  const indexNames = new Set(indexes.map((i) => i.name));

  if (!indexNames.has('idx_custom_properties_project_name')) {
    db.exec(
      'CREATE UNIQUE INDEX idx_custom_properties_project_name ON custom_properties(project_id, name) WHERE deleted_at IS NULL'
    );
  }
}

export async function down({ context: db }: MigrationParams<Database.Database>): Promise<void> {
  db.exec('DROP TABLE IF EXISTS custom_properties');
}
