import type { MigrationParams } from 'umzug';
import type Database from 'better-sqlite3';

export async function up({ context: db }: MigrationParams<Database.Database>): Promise<void> {
  const existingTables = db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('pages', 'page_versions')"
    )
    .all() as { name: string }[];
  const tableNames = new Set(existingTables.map((t) => t.name));

  if (!tableNames.has('pages')) {
    db.exec(`
      CREATE TABLE pages (
        id          TEXT PRIMARY KEY,
        project_id  TEXT NOT NULL,
        title       TEXT NOT NULL,
        content     TEXT,
        parent_id   TEXT,
        sort_order  REAL NOT NULL DEFAULT 0,
        is_favorite INTEGER NOT NULL DEFAULT 0,
        created_at  INTEGER NOT NULL,
        updated_at  INTEGER NOT NULL,
        deleted_at  INTEGER,
        FOREIGN KEY (project_id) REFERENCES pm_projects(id),
        FOREIGN KEY (parent_id) REFERENCES pages(id)
      )
    `);

    db.exec('CREATE INDEX idx_pages_project_id ON pages(project_id)');
    db.exec('CREATE INDEX idx_pages_parent_id ON pages(parent_id)');
  }

  if (!tableNames.has('page_versions')) {
    db.exec(`
      CREATE TABLE page_versions (
        id             TEXT PRIMARY KEY,
        page_id        TEXT NOT NULL,
        version_number INTEGER NOT NULL,
        title          TEXT NOT NULL,
        content        TEXT,
        created_at     INTEGER NOT NULL,
        updated_at     INTEGER NOT NULL,
        FOREIGN KEY (page_id) REFERENCES pages(id)
      )
    `);

    db.exec('CREATE INDEX idx_page_versions_page_id ON page_versions(page_id)');
    db.exec(
      'CREATE UNIQUE INDEX idx_page_versions_page_version ON page_versions(page_id, version_number)'
    );
  }
}

export async function down({ context: db }: MigrationParams<Database.Database>): Promise<void> {
  db.exec('DROP TABLE IF EXISTS page_versions');
  db.exec('DROP TABLE IF EXISTS pages');
}
