/**
 * Migration 096: github_integration table.
 *
 * Stores a single encrypted GitHub Personal Access Token. Mirrors the
 * cloud_provider_tokens schema (LocalSecretBox AES-256-GCM blob), but
 * with a single fixed row (id = 1) since there's only ever one GitHub
 * integration per shep instance.
 *
 * Idempotent.
 */

import type { MigrationParams } from 'umzug';
import type Database from 'better-sqlite3';

export async function up({ context: db }: MigrationParams<Database.Database>): Promise<void> {
  const existing = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='github_integration'")
    .get();

  if (!existing) {
    db.exec(`
      CREATE TABLE github_integration (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        token_ciphertext BLOB NOT NULL,
        token_iv BLOB NOT NULL,
        token_tag BLOB NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `);
  }
}

export async function down(_params: MigrationParams<Database.Database>): Promise<void> {
  // Keep the table on rollback to avoid silent token loss.
}
