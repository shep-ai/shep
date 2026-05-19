/**
 * Migration 101: Add bedrock_enabled column to applications table.
 *
 * Supports the project-bedrock integration which adds an opt-in
 * "bedrock memory" lifecycle to each Application. The persisted flag
 * is the single source of truth for whether project-bedrock has been
 * enabled on a given workspace — read by the EnableBedrockForApplication
 * and RunBedrockLifecycle use cases, the `shep bedrock` CLI command
 * group, and the web detail-page toggle.
 *
 *  - bedrock_enabled (INTEGER NOT NULL DEFAULT 0): SQLite has no native
 *    boolean; stored as 1/0 to match every other boolean column in the
 *    applications table (e.g. setup_complete). DEFAULT 0 covers existing
 *    rows in a single atomic statement — no separate backfill needed.
 *
 * Idempotency: the ALTER TABLE is guarded by `pragma table_info` so the
 * migration is safe to re-run.
 *
 * `down()` is a no-op (matches the project's no-rollback migration
 * convention used by 044, 049, 054, 094, etc.).
 */

import type { MigrationParams } from 'umzug';
import type Database from 'better-sqlite3';

export async function up({ context: db }: MigrationParams<Database.Database>): Promise<void> {
  const columns = db.pragma('table_info(applications)') as { name: string }[];
  const names = new Set(columns.map((c) => c.name));

  if (!names.has('bedrock_enabled')) {
    db.exec('ALTER TABLE applications ADD COLUMN bedrock_enabled INTEGER NOT NULL DEFAULT 0');
  }
}

export async function down({ context: db }: MigrationParams<Database.Database>): Promise<void> {
  void db;
}
