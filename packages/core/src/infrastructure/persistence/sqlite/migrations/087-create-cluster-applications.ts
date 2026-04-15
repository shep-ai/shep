/**
 * Migration 087: Create cluster_applications junction table.
 *
 * Creates the many-to-many junction table linking clusters to applications.
 * Same pattern as cluster_repositories (migration 086) with compound
 * unique index and individual FK indexes.
 */

import type { MigrationParams } from 'umzug';
import type Database from 'better-sqlite3';

export async function up({ context: db }: MigrationParams<Database.Database>): Promise<void> {
  const tables = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='cluster_applications'")
    .all() as { name: string }[];

  if (tables.length === 0) {
    db.exec(`
      CREATE TABLE cluster_applications (
        id              TEXT PRIMARY KEY,
        cluster_id      TEXT NOT NULL,
        application_id  TEXT NOT NULL,
        created_at      INTEGER NOT NULL,
        FOREIGN KEY (cluster_id) REFERENCES clusters(id),
        FOREIGN KEY (application_id) REFERENCES applications(id)
      )
    `);
  }

  const indexes = db.pragma('index_list(cluster_applications)') as { name: string }[];
  const indexNames = new Set(indexes.map((i) => i.name));

  if (!indexNames.has('idx_cluster_applications_unique')) {
    db.exec(
      'CREATE UNIQUE INDEX idx_cluster_applications_unique ON cluster_applications(cluster_id, application_id)'
    );
  }
  if (!indexNames.has('idx_cluster_applications_cluster_id')) {
    db.exec('CREATE INDEX idx_cluster_applications_cluster_id ON cluster_applications(cluster_id)');
  }
  if (!indexNames.has('idx_cluster_applications_application_id')) {
    db.exec(
      'CREATE INDEX idx_cluster_applications_application_id ON cluster_applications(application_id)'
    );
  }
}

export async function down({ context: db }: MigrationParams<Database.Database>): Promise<void> {
  db.exec('DROP TABLE IF EXISTS cluster_applications');
}
