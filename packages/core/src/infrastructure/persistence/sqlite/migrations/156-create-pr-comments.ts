/**
 * Migration 156: PR comment loop (spec 124).
 *
 * - pr_comments: review comments on a feature's pull request; one row per
 *   (feature, kind, GitHub id), so reading them again never duplicates.
 * - pr_comment_rounds: agent turns that addressed them; comment_ids is a JSON
 *   array.
 * - spaces gains pr_comment_trigger and pr_comment_resolve_threads.
 *
 * Additive and idempotent.
 */

import type { MigrationParams } from 'umzug';
import type Database from 'better-sqlite3';

const SPACE_COLUMNS: readonly [name: string, type: string][] = [
  ['pr_comment_trigger', 'TEXT'],
  ['pr_comment_resolve_threads', 'INTEGER'],
];

export async function up({ context: db }: MigrationParams<Database.Database>): Promise<void> {
  db.exec(`
    CREATE TABLE IF NOT EXISTS pr_comments (
      id TEXT PRIMARY KEY,
      feature_id TEXT NOT NULL,
      github_id TEXT NOT NULL,
      kind TEXT NOT NULL,
      author TEXT NOT NULL,
      body TEXT NOT NULL,
      path TEXT,
      line INTEGER,
      diff_hunk TEXT,
      thread_id TEXT,
      url TEXT NOT NULL,
      written_at INTEGER NOT NULL,
      status TEXT NOT NULL,
      reply TEXT,
      reply_url TEXT,
      round_id TEXT,
      error TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      UNIQUE (feature_id, kind, github_id)
    );
    CREATE INDEX IF NOT EXISTS idx_pr_comments_feature ON pr_comments (feature_id, written_at);

    CREATE TABLE IF NOT EXISTS pr_comment_rounds (
      id TEXT PRIMARY KEY,
      feature_id TEXT NOT NULL,
      comment_ids TEXT NOT NULL,
      status TEXT NOT NULL,
      agent_type TEXT,
      commit_sha TEXT,
      summary TEXT,
      error TEXT,
      finished_at INTEGER,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_pr_comment_rounds_feature
      ON pr_comment_rounds (feature_id, created_at);
  `);

  const existing = new Set(
    (db.pragma('table_info(spaces)') as { name: string }[]).map((column) => column.name)
  );
  for (const [name, type] of SPACE_COLUMNS) {
    if (!existing.has(name)) db.exec(`ALTER TABLE spaces ADD COLUMN ${name} ${type}`);
  }
}

export async function down(_params: MigrationParams<Database.Database>): Promise<void> {
  // Additive migration: new tables and nullable columns are harmless to an older build.
}
