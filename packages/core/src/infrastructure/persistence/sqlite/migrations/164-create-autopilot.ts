/**
 * Migration 164: Autopilot (spec 132).
 *
 * - autopilot_policies: what shep starts on its own in a space.
 * - autopilot_runs: each pass, with what it started and what failed (JSON arrays).
 *
 * Additive and idempotent.
 */

import type { MigrationParams } from 'umzug';
import type Database from 'better-sqlite3';

export async function up({ context: db }: MigrationParams<Database.Database>): Promise<void> {
  db.exec(`
    CREATE TABLE IF NOT EXISTS autopilot_policies (
      space_id TEXT PRIMARY KEY,
      investigate_urgent INTEGER NOT NULL DEFAULT 0,
      fix_confident INTEGER NOT NULL DEFAULT 0,
      merge_fixes INTEGER NOT NULL DEFAULT 0,
      fill_line INTEGER NOT NULL DEFAULT 0,
      project_id TEXT,
      daily_fix_budget INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS autopilot_runs (
      id TEXT PRIMARY KEY,
      space_id TEXT NOT NULL,
      investigated TEXT NOT NULL,
      fixed TEXT NOT NULL,
      built TEXT NOT NULL,
      errors TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_autopilot_runs_space ON autopilot_runs (space_id, created_at);
  `);
}

export async function down(_params: MigrationParams<Database.Database>): Promise<void> {
  // Additive migration: new tables are harmless to an older build.
}
