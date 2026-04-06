import type { MigrationParams } from 'umzug';
import type Database from 'better-sqlite3';

export async function up({ context: db }: MigrationParams<Database.Database>): Promise<void> {
  const tables = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='applications'")
    .all() as { name: string }[];

  if (tables.length === 0) {
    db.exec(`
      CREATE TABLE applications (
        id              TEXT PRIMARY KEY,
        name            TEXT NOT NULL,
        slug            TEXT NOT NULL,
        description     TEXT NOT NULL,
        repository_path TEXT NOT NULL,
        additional_paths TEXT NOT NULL DEFAULT '[]',
        agent_type      TEXT,
        model_override  TEXT,
        status          TEXT NOT NULL DEFAULT 'Idle',
        created_at      INTEGER NOT NULL,
        updated_at      INTEGER NOT NULL,
        deleted_at      INTEGER
      )
    `);
  }

  const indexes = db.pragma('index_list(applications)') as { name: string }[];
  const indexNames = new Set(indexes.map((i) => i.name));

  if (!indexNames.has('idx_applications_slug')) {
    db.exec(
      'CREATE UNIQUE INDEX idx_applications_slug ON applications(slug) WHERE deleted_at IS NULL'
    );
  }
  if (!indexNames.has('idx_applications_repository_path')) {
    db.exec(
      "CREATE INDEX idx_applications_repository_path ON applications(REPLACE(repository_path, '\\', '/'))"
    );
  }
}

export async function down({ context: db }: MigrationParams<Database.Database>): Promise<void> {
  db.exec('DROP TABLE IF EXISTS applications');
}
