/**
 * Migration 150: Query-aware harness eval runs and results (spec 119).
 * Same JSON-document layout as migration 148.
 */

import type { MigrationParams } from 'umzug';
import type Database from 'better-sqlite3';

export async function up({ context: db }: MigrationParams<Database.Database>): Promise<void> {
  db.exec(`
    CREATE TABLE IF NOT EXISTS harness_eval_runs (
      id TEXT PRIMARY KEY,
      suite TEXT NOT NULL,
      status TEXT NOT NULL,
      data TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_harness_eval_runs_created ON harness_eval_runs(created_at);

    CREATE TABLE IF NOT EXISTS harness_eval_results (
      id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL,
      case_id TEXT NOT NULL,
      variant TEXT NOT NULL,
      data TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_harness_eval_results_run ON harness_eval_results(run_id, case_id);
  `);
}

export async function down({ context: db }: MigrationParams<Database.Database>): Promise<void> {
  db.exec(`
    DROP TABLE IF EXISTS harness_eval_results;
    DROP TABLE IF EXISTS harness_eval_runs;
  `);
}
