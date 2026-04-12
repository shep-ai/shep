import type { MigrationParams } from 'umzug';
import type Database from 'better-sqlite3';

export async function up({ context: db }: MigrationParams<Database.Database>): Promise<void> {
  const tables = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='labels'")
    .all() as { name: string }[];

  if (tables.length === 0) {
    db.exec(`
      CREATE TABLE labels (
        id         TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        name       TEXT NOT NULL,
        color      TEXT NOT NULL,
        parent_id  TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        deleted_at INTEGER,
        FOREIGN KEY (project_id) REFERENCES pm_projects(id),
        FOREIGN KEY (parent_id) REFERENCES labels(id)
      )
    `);
  }

  const indexes = db.pragma('index_list(labels)') as { name: string }[];
  const indexNames = new Set(indexes.map((i) => i.name));

  if (!indexNames.has('idx_labels_project_name')) {
    db.exec(
      'CREATE UNIQUE INDEX idx_labels_project_name ON labels(project_id, name) WHERE deleted_at IS NULL'
    );
  }
  if (!indexNames.has('idx_labels_project_id')) {
    db.exec('CREATE INDEX idx_labels_project_id ON labels(project_id)');
  }
}

export async function down({ context: db }: MigrationParams<Database.Database>): Promise<void> {
  db.exec('DROP TABLE IF EXISTS labels');
}
