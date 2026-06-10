/**
 * Migration 045: Create scheduled_workflows and workflow_executions tables.
 *
 * Creates the persistence schema for the scheduled-workflows feature:
 * - scheduled_workflows: Stores workflow definitions with cron schedules
 * - workflow_executions: Stores execution history for each workflow run
 *
 * Uses CREATE TABLE IF NOT EXISTS and CREATE INDEX IF NOT EXISTS for idempotency.
 */

import type { MigrationParams } from 'umzug';
import type Database from 'better-sqlite3';

export async function up({ context: db }: MigrationParams<Database.Database>): Promise<void> {
  db.exec(`
    CREATE TABLE IF NOT EXISTS scheduled_workflows (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      prompt TEXT NOT NULL,
      tool_constraints TEXT,
      cron_expression TEXT,
      timezone TEXT,
      enabled INTEGER NOT NULL DEFAULT 1,
      last_run_at INTEGER,
      next_run_at INTEGER,
      repository_path TEXT NOT NULL,
      deleted_at INTEGER,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      UNIQUE(name, repository_path)
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS workflow_executions (
      id TEXT PRIMARY KEY NOT NULL,
      workflow_id TEXT NOT NULL,
      trigger_type TEXT NOT NULL,
      status TEXT NOT NULL,
      started_at INTEGER NOT NULL,
      completed_at INTEGER,
      duration_ms INTEGER,
      output_summary TEXT,
      error_message TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY (workflow_id) REFERENCES scheduled_workflows(id)
    )
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_workflow_executions_workflow_id
    ON workflow_executions(workflow_id)
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_workflow_executions_started_at
    ON workflow_executions(started_at)
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_workflow_executions_status_started
    ON workflow_executions(status, started_at)
  `);
}

export async function down({ context: db }: MigrationParams<Database.Database>): Promise<void> {
  db.exec('DROP INDEX IF EXISTS idx_workflow_executions_status_started');
  db.exec('DROP INDEX IF EXISTS idx_workflow_executions_started_at');
  db.exec('DROP INDEX IF EXISTS idx_workflow_executions_workflow_id');
  db.exec('DROP TABLE IF EXISTS workflow_executions');
  db.exec('DROP TABLE IF EXISTS scheduled_workflows');
}
