/**
 * Migration 055: Add fork tracking fields to repositories table
 *
 * Adds is_fork (boolean as INTEGER) and upstream_url (TEXT) columns
 * to support auto-fork detection when importing remote repositories
 * the user lacks push access to.
 */

import type { MigrationParams } from 'umzug';
import type Database from 'better-sqlite3';

export async function up({ context: db }: MigrationParams<Database.Database>): Promise<void> {
  const columns = db.pragma('table_info(repositories)') as { name: string }[];
  const names = new Set(columns.map((c) => c.name));

  if (!names.has('is_fork')) {
    db.exec('ALTER TABLE repositories ADD COLUMN is_fork INTEGER DEFAULT 0');
  }
  if (!names.has('upstream_url')) {
    db.exec('ALTER TABLE repositories ADD COLUMN upstream_url TEXT');
  }

  // Check if index already exists before creating
  const indexes = db.pragma('index_list(repositories)') as { name: string }[];
  const indexNames = new Set(indexes.map((i) => i.name));
  if (!indexNames.has('idx_repositories_upstream_url')) {
    db.exec('CREATE INDEX idx_repositories_upstream_url ON repositories(upstream_url)');
  }
}

export async function down({ context: db }: MigrationParams<Database.Database>): Promise<void> {
  void db;
}
