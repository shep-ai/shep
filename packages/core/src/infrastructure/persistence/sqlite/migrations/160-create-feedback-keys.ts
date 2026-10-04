/**
 * Migration 160: Feedback keys and signal external ids (spec 127).
 *
 * - feedback_keys: keys tools use to post feedback into a space; only a hash
 *   of each key is stored.
 * - signals.external_id: the sending tool's id, unique within a space, so a
 *   retried delivery cannot record a second signal.
 *
 * Additive and idempotent.
 */

import type { MigrationParams } from 'umzug';
import type Database from 'better-sqlite3';

export async function up({ context: db }: MigrationParams<Database.Database>): Promise<void> {
  db.exec(`
    CREATE TABLE IF NOT EXISTS feedback_keys (
      id TEXT PRIMARY KEY,
      space_id TEXT NOT NULL,
      name TEXT NOT NULL,
      prefix TEXT NOT NULL,
      key_hash TEXT NOT NULL UNIQUE,
      last_used_at INTEGER,
      revoked_at INTEGER,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_feedback_keys_space ON feedback_keys (space_id);
  `);
  const columns = db.prepare('PRAGMA table_info(signals)').all() as { name: string }[];
  if (!columns.some((column) => column.name === 'external_id')) {
    db.exec('ALTER TABLE signals ADD COLUMN external_id TEXT');
  }
  db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_signals_external
      ON signals (space_id, external_id) WHERE external_id IS NOT NULL;
  `);
}

export async function down(_params: MigrationParams<Database.Database>): Promise<void> {
  // Additive migration: a new table and nullable column are harmless to an older build.
}
