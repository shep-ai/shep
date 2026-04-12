import type { MigrationParams } from 'umzug';
import type Database from 'better-sqlite3';

export async function up({ context: db }: MigrationParams<Database.Database>): Promise<void> {
  const tables = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='pm_projects'")
    .all() as { name: string }[];

  if (tables.length === 0) {
    db.exec(`
      CREATE TABLE pm_projects (
        id                TEXT PRIMARY KEY,
        name              TEXT NOT NULL,
        slug              TEXT NOT NULL,
        description       TEXT,
        identifier_prefix TEXT NOT NULL,
        work_item_counter INTEGER NOT NULL DEFAULT 0,
        estimate_type     TEXT NOT NULL DEFAULT 'Category',
        application_id    TEXT,
        start_date        INTEGER,
        end_date          INTEGER,
        feature_toggles   TEXT,
        created_at        INTEGER NOT NULL,
        updated_at        INTEGER NOT NULL,
        deleted_at        INTEGER
      )
    `);
  }

  const indexes = db.pragma('index_list(pm_projects)') as { name: string }[];
  const indexNames = new Set(indexes.map((i) => i.name));

  if (!indexNames.has('idx_pm_projects_identifier_prefix')) {
    db.exec(
      'CREATE UNIQUE INDEX idx_pm_projects_identifier_prefix ON pm_projects(identifier_prefix) WHERE deleted_at IS NULL'
    );
  }
  if (!indexNames.has('idx_pm_projects_slug')) {
    db.exec('CREATE INDEX idx_pm_projects_slug ON pm_projects(slug)');
  }
  if (!indexNames.has('idx_pm_projects_application_id')) {
    db.exec('CREATE INDEX idx_pm_projects_application_id ON pm_projects(application_id)');
  }
}

export async function down({ context: db }: MigrationParams<Database.Database>): Promise<void> {
  db.exec('DROP TABLE IF EXISTS pm_projects');
}
