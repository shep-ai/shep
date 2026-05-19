/**
 * Migration 103: Add bedrock_enabled column to features table.
 *
 * Extends the project-bedrock integration to per-feature worktrees so a
 * user can opt in to bedrock memory at the Feature granularity (e.g.
 * for a spec-driven run inside an isolated worktree) without enabling
 * it on the parent Application or Repository.
 *
 *  - bedrock_enabled (INTEGER NOT NULL DEFAULT 0): persisted as 1/0 to
 *    match every other boolean column in the features table (e.g.
 *    push, open_pr, inject_skills). DEFAULT 0 covers existing rows in
 *    a single atomic statement — no separate backfill needed.
 *
 * Idempotency: the ALTER TABLE is guarded by `pragma table_info` so
 * the migration is safe to re-run.
 *
 * `down()` is a no-op (matches the project's no-rollback migration
 * convention used by 044, 049, 054, 094, 101, 102, etc.).
 */

import type { MigrationParams } from 'umzug';
import type Database from 'better-sqlite3';

export async function up({ context: db }: MigrationParams<Database.Database>): Promise<void> {
  const columns = db.pragma('table_info(features)') as { name: string }[];
  const names = new Set(columns.map((c) => c.name));

  if (!names.has('bedrock_enabled')) {
    db.exec('ALTER TABLE features ADD COLUMN bedrock_enabled INTEGER NOT NULL DEFAULT 0');
  }
}

export async function down({ context: db }: MigrationParams<Database.Database>): Promise<void> {
  void db;
}
