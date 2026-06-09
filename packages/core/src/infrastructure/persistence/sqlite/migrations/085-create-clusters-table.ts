/**
 * Migration 085: Create clusters table.
 *
 * Creates the primary clusters table for storing Cluster entities.
 * Columns match the TypeSpec Cluster entity extending SoftDeletableEntity.
 * Includes unique partial index on slug (WHERE deleted_at IS NULL) and
 * index on status for filtered queries.
 */

import type { MigrationParams } from 'umzug';
import type Database from 'better-sqlite3';

export async function up({ context: db }: MigrationParams<Database.Database>): Promise<void> {
  const tables = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='clusters'")
    .all() as { name: string }[];

  if (tables.length === 0) {
    db.exec(`
      CREATE TABLE clusters (
        id                    TEXT PRIMARY KEY,
        name                  TEXT NOT NULL,
        slug                  TEXT NOT NULL,
        description           TEXT,
        status                TEXT NOT NULL DEFAULT 'Stopped',
        k3d_cluster_name      TEXT,
        kubeconfig_path       TEXT,
        argocd_enabled        INTEGER NOT NULL DEFAULT 0,
        argocd_namespace      TEXT DEFAULT 'argocd',
        node_count            INTEGER NOT NULL DEFAULT 1,
        last_provisioned_at   INTEGER,
        last_health_check_at  INTEGER,
        error_message         TEXT,
        created_at            INTEGER NOT NULL,
        updated_at            INTEGER NOT NULL,
        deleted_at            INTEGER
      )
    `);
  }

  const indexes = db.pragma('index_list(clusters)') as { name: string }[];
  const indexNames = new Set(indexes.map((i) => i.name));

  if (!indexNames.has('idx_clusters_slug')) {
    db.exec('CREATE UNIQUE INDEX idx_clusters_slug ON clusters(slug) WHERE deleted_at IS NULL');
  }
  if (!indexNames.has('idx_clusters_status')) {
    db.exec('CREATE INDEX idx_clusters_status ON clusters(status)');
  }
}

export async function down({ context: db }: MigrationParams<Database.Database>): Promise<void> {
  db.exec('DROP TABLE IF EXISTS clusters');
}
