/**
 * Migration 155: Work item investigations (spec 123).
 *
 * One row per investigation of a work item in a repository. hypotheses is a
 * JSON array of Hypothesis, most likely first.
 *
 * Additive and idempotent.
 */

import type { MigrationParams } from 'umzug';
import type Database from 'better-sqlite3';

export async function up({ context: db }: MigrationParams<Database.Database>): Promise<void> {
  db.exec(`
    CREATE TABLE IF NOT EXISTS work_item_investigations (
      id TEXT PRIMARY KEY,
      work_item_id TEXT NOT NULL,
      repository_path TEXT NOT NULL,
      commit_sha TEXT,
      status TEXT NOT NULL,
      summary TEXT,
      hypotheses TEXT NOT NULL,
      agent_type TEXT,
      error TEXT,
      started_at INTEGER,
      finished_at INTEGER,
      approved_hypothesis_number INTEGER,
      feature_id TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_work_item_investigations_item
      ON work_item_investigations (work_item_id, created_at);
  `);
}

export async function down(_params: MigrationParams<Database.Database>): Promise<void> {
  // Additive migration: a new table is harmless to an older build.
}
