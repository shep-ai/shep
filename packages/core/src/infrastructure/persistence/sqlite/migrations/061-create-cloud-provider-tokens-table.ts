import type { MigrationParams } from 'umzug';
import type Database from 'better-sqlite3';

export async function up({ context: db }: MigrationParams<Database.Database>): Promise<void> {
  const existing = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='cloud_provider_tokens'")
    .get();

  if (!existing) {
    db.exec(`
      CREATE TABLE cloud_provider_tokens (
        provider TEXT PRIMARY KEY NOT NULL,
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
  // SQLite DROP TABLE is supported, but we keep the table to avoid data loss on rollback.
}
