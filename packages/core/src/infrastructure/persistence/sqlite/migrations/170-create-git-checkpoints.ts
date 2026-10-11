/**
 * Migration 170: git_checkpoints (spec 138).
 *
 * One row per hidden-ref checkpoint of a feature's worktree. The sequence is
 * unique per feature because the ref name embeds it.
 *
 * Additive and idempotent.
 */

import type { MigrationParams } from 'umzug';
import type Database from 'better-sqlite3';

export async function up({ context: db }: MigrationParams<Database.Database>): Promise<void> {
  db.exec(`
    CREATE TABLE IF NOT EXISTS git_checkpoints (
      id TEXT PRIMARY KEY,
      feature_id TEXT NOT NULL,
      agent_run_id TEXT,
      sequence INTEGER NOT NULL,
      kind TEXT NOT NULL,
      node TEXT NOT NULL,
      ref TEXT NOT NULL,
      commit_sha TEXT NOT NULL,
      tree_sha TEXT NOT NULL,
      head_sha TEXT,
      files_changed INTEGER NOT NULL DEFAULT 0,
      additions INTEGER NOT NULL DEFAULT 0,
      deletions INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      UNIQUE (feature_id, sequence)
    );
  `);
}

export async function down(_params: MigrationParams<Database.Database>): Promise<void> {
  // Additive migration: a new table is harmless to an older build.
}
