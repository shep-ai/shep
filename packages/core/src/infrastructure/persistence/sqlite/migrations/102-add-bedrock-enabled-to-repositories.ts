/**
 * Migration 102: Add bedrock_enabled column to repositories table.
 *
 * Extends the project-bedrock integration beyond Applications so that
 * any tracked Repository can opt in to bedrock memory independently.
 * Pairs with the parallel migration on the `features` table (103) and
 * mirrors migration 101 on `applications`.
 *
 *  - bedrock_enabled (INTEGER NOT NULL DEFAULT 0): persisted as 1/0 to
 *    match every other boolean column in the schema. DEFAULT 0 covers
 *    existing rows in a single atomic statement — no separate backfill
 *    needed.
 *
 * Idempotency: the ALTER TABLE is guarded by `pragma table_info` so
 * the migration is safe to re-run.
 *
 * `down()` is a no-op (matches the project's no-rollback migration
 * convention used by 044, 049, 054, 094, 101, etc.).
 */

import type { MigrationParams } from 'umzug';
import type Database from 'better-sqlite3';

export async function up({ context: db }: MigrationParams<Database.Database>): Promise<void> {
  const columns = db.pragma('table_info(repositories)') as { name: string }[];
  const names = new Set(columns.map((c) => c.name));

  if (!names.has('bedrock_enabled')) {
    db.exec('ALTER TABLE repositories ADD COLUMN bedrock_enabled INTEGER NOT NULL DEFAULT 0');
  }
}

export async function down({ context: db }: MigrationParams<Database.Database>): Promise<void> {
  void db;
}
