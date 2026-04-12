import type { MigrationParams } from 'umzug';
import type Database from 'better-sqlite3';

export async function up({ context: db }: MigrationParams<Database.Database>): Promise<void> {
  const tables = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='saved_views'")
    .all() as { name: string }[];

  if (tables.length === 0) {
    db.exec(`
      CREATE TABLE saved_views (
        id            TEXT PRIMARY KEY,
        project_id    TEXT NOT NULL,
        name          TEXT NOT NULL,
        description   TEXT,
        is_public     INTEGER NOT NULL DEFAULT 0,
        layout        TEXT NOT NULL,
        configuration TEXT NOT NULL,
        created_by    TEXT,
        created_at    INTEGER NOT NULL,
        updated_at    INTEGER NOT NULL,
        deleted_at    INTEGER,
        FOREIGN KEY (project_id) REFERENCES pm_projects(id)
      )
    `);
  }

  const indexes = db.pragma('index_list(saved_views)') as { name: string }[];
  const indexNames = new Set(indexes.map((i) => i.name));

  if (!indexNames.has('idx_saved_views_project_id')) {
    db.exec('CREATE INDEX idx_saved_views_project_id ON saved_views(project_id)');
  }
  if (!indexNames.has('idx_saved_views_layout')) {
    db.exec('CREATE INDEX idx_saved_views_layout ON saved_views(project_id, layout)');
  }
}

export async function down({ context: db }: MigrationParams<Database.Database>): Promise<void> {
  db.exec('DROP TABLE IF EXISTS saved_views');
}
