/**
 * Migration 148: Query-aware harness core state (spec 119).
 *
 * Every harness table stores the full entity as a JSON document (`data`) plus
 * the handful of columns queries filter or sort on. Adding a field to a
 * harness entity therefore needs no migration and cannot be dropped by a
 * forgotten INSERT column (the recurring settings-column failure in
 * LESSONS.md). Raw content never lives here: chunks reference the
 * content-addressed blob store under ~/.shep/objects.
 *
 * Tables: harness_sessions, harness_tasks, harness_events,
 * harness_repo_snapshots, harness_chunks, harness_chunk_views,
 * harness_context_plans. All CREATE … IF NOT EXISTS, so re-running is a no-op.
 */

import type { MigrationParams } from 'umzug';
import type Database from 'better-sqlite3';

export async function up({ context: db }: MigrationParams<Database.Database>): Promise<void> {
  db.exec(`
    CREATE TABLE IF NOT EXISTS harness_sessions (
      id TEXT PRIMARY KEY,
      status TEXT NOT NULL,
      origin TEXT NOT NULL,
      agent_run_id TEXT,
      feature_id TEXT,
      data TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_harness_sessions_agent_run ON harness_sessions(agent_run_id);
    CREATE INDEX IF NOT EXISTS idx_harness_sessions_feature ON harness_sessions(feature_id);
    CREATE INDEX IF NOT EXISTS idx_harness_sessions_updated ON harness_sessions(updated_at);

    CREATE TABLE IF NOT EXISTS harness_tasks (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      parent_task_id TEXT,
      status TEXT NOT NULL,
      dedupe_key TEXT NOT NULL,
      data TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_harness_tasks_session ON harness_tasks(session_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_harness_tasks_dedupe ON harness_tasks(dedupe_key, status);

    CREATE TABLE IF NOT EXISTS harness_events (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      task_id TEXT,
      sequence INTEGER NOT NULL,
      type TEXT NOT NULL,
      payload TEXT NOT NULL,
      payload_ref TEXT,
      created_at INTEGER NOT NULL,
      UNIQUE(session_id, sequence)
    );
    CREATE INDEX IF NOT EXISTS idx_harness_events_task ON harness_events(task_id);

    CREATE TABLE IF NOT EXISTS harness_repo_snapshots (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      data TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_harness_snapshots_session ON harness_repo_snapshots(session_id, created_at);

    CREATE TABLE IF NOT EXISTS harness_chunks (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      task_id TEXT,
      kind TEXT NOT NULL,
      path TEXT,
      content_hash TEXT NOT NULL,
      superseded_by TEXT,
      data TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_harness_chunks_session ON harness_chunks(session_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_harness_chunks_task ON harness_chunks(task_id);
    CREATE INDEX IF NOT EXISTS idx_harness_chunks_path ON harness_chunks(session_id, path);

    CREATE TABLE IF NOT EXISTS harness_chunk_views (
      id TEXT PRIMARY KEY,
      chunk_id TEXT NOT NULL,
      query_fingerprint TEXT NOT NULL,
      visibility TEXT NOT NULL,
      renderer_id TEXT NOT NULL,
      data TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      UNIQUE(chunk_id, query_fingerprint, visibility, renderer_id)
    );

    CREATE TABLE IF NOT EXISTS harness_context_plans (
      id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL,
      turn INTEGER NOT NULL,
      shadow INTEGER NOT NULL,
      data TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_harness_plans_task ON harness_context_plans(task_id, turn);
  `);
}

export async function down({ context: db }: MigrationParams<Database.Database>): Promise<void> {
  db.exec(`
    DROP TABLE IF EXISTS harness_context_plans;
    DROP TABLE IF EXISTS harness_chunk_views;
    DROP TABLE IF EXISTS harness_chunks;
    DROP TABLE IF EXISTS harness_repo_snapshots;
    DROP TABLE IF EXISTS harness_events;
    DROP TABLE IF EXISTS harness_tasks;
    DROP TABLE IF EXISTS harness_sessions;
  `);
}
