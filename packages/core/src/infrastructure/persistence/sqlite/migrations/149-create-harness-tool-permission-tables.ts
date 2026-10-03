/**
 * Migration 149: Query-aware harness decisions, model calls, tool calls and
 * permissions (spec 119). Same JSON-document layout as migration 148.
 *
 * `harness_permission_decisions.status` is a real column because resolving a
 * pending request is a conditional UPDATE (`… WHERE status = 'pending'`): two
 * concurrent approvals must not both win.
 */

import type { MigrationParams } from 'umzug';
import type Database from 'better-sqlite3';

export async function up({ context: db }: MigrationParams<Database.Database>): Promise<void> {
  db.exec(`
    CREATE TABLE IF NOT EXISTS harness_decisions (
      id TEXT PRIMARY KEY,
      task_id TEXT,
      kind TEXT NOT NULL,
      context_plan_id TEXT,
      data TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_harness_decisions_task ON harness_decisions(task_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_harness_decisions_plan ON harness_decisions(context_plan_id);

    CREATE TABLE IF NOT EXISTS harness_model_calls (
      id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL,
      turn INTEGER NOT NULL,
      status TEXT NOT NULL,
      data TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_harness_model_calls_task ON harness_model_calls(task_id, turn);

    CREATE TABLE IF NOT EXISTS harness_tool_calls (
      id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL,
      turn INTEGER NOT NULL,
      status TEXT NOT NULL,
      idempotency_key TEXT NOT NULL,
      data TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_harness_tool_calls_task ON harness_tool_calls(task_id, turn);
    CREATE INDEX IF NOT EXISTS idx_harness_tool_calls_idem ON harness_tool_calls(idempotency_key);

    CREATE TABLE IF NOT EXISTS harness_permission_decisions (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      task_id TEXT NOT NULL,
      status TEXT NOT NULL,
      data TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_harness_permissions_status ON harness_permission_decisions(status, created_at);
    CREATE INDEX IF NOT EXISTS idx_harness_permissions_session ON harness_permission_decisions(session_id, created_at);

    CREATE TABLE IF NOT EXISTS harness_permission_grants (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      task_id TEXT,
      consumed INTEGER NOT NULL DEFAULT 0,
      data TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_harness_grants_session ON harness_permission_grants(session_id);
  `);
}

export async function down({ context: db }: MigrationParams<Database.Database>): Promise<void> {
  db.exec(`
    DROP TABLE IF EXISTS harness_permission_grants;
    DROP TABLE IF EXISTS harness_permission_decisions;
    DROP TABLE IF EXISTS harness_tool_calls;
    DROP TABLE IF EXISTS harness_model_calls;
    DROP TABLE IF EXISTS harness_decisions;
  `);
}
