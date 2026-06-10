/**
 * Migration 086: Create cluster_repositories junction table.
 *
 * Creates the many-to-many junction table linking clusters to repositories.
 * Follows the work_item_relations pattern (migration 068) with compound
 * unique index and individual FK indexes.
 */

import type { MigrationParams } from 'umzug';
import type Database from 'better-sqlite3';

export async function up({ context: db }: MigrationParams<Database.Database>): Promise<void> {
  const tables = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='cluster_repositories'")
    .all() as { name: string }[];

  if (tables.length === 0) {
    db.exec(`
      CREATE TABLE cluster_repositories (
        id              TEXT PRIMARY KEY,
        cluster_id      TEXT NOT NULL,
        repository_id   TEXT NOT NULL,
        created_at      INTEGER NOT NULL,
        FOREIGN KEY (cluster_id) REFERENCES clusters(id),
        FOREIGN KEY (repository_id) REFERENCES repositories(id)
      )
    `);
  }

  const indexes = db.pragma('index_list(cluster_repositories)') as { name: string }[];
  const indexNames = new Set(indexes.map((i) => i.name));

  if (!indexNames.has('idx_cluster_repositories_unique')) {
    db.exec(
      'CREATE UNIQUE INDEX idx_cluster_repositories_unique ON cluster_repositories(cluster_id, repository_id)'
    );
  }
  if (!indexNames.has('idx_cluster_repositories_cluster_id')) {
    db.exec('CREATE INDEX idx_cluster_repositories_cluster_id ON cluster_repositories(cluster_id)');
  }
  if (!indexNames.has('idx_cluster_repositories_repository_id')) {
    db.exec(
      'CREATE INDEX idx_cluster_repositories_repository_id ON cluster_repositories(repository_id)'
    );
  }
}

export async function down({ context: db }: MigrationParams<Database.Database>): Promise<void> {
  db.exec('DROP TABLE IF EXISTS cluster_repositories');
}
