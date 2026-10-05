/**
 * Migration 162: Incidents (spec 129).
 *
 * - incidents: something broke in production, in a space.
 * - incident_events: each incident's timeline.
 * - runtime_actions: restarts, rollbacks and scales of an incident's workload.
 *
 * Additive and idempotent.
 */

import type { MigrationParams } from 'umzug';
import type Database from 'better-sqlite3';

export async function up({ context: db }: MigrationParams<Database.Database>): Promise<void> {
  db.exec(`
    CREATE TABLE IF NOT EXISTS incidents (
      id TEXT PRIMARY KEY,
      space_id TEXT NOT NULL,
      title TEXT NOT NULL,
      severity TEXT NOT NULL,
      status TEXT NOT NULL,
      source TEXT NOT NULL,
      detail TEXT,
      url TEXT,
      external_id TEXT,
      runtime_context TEXT,
      runtime_namespace TEXT,
      runtime_workload TEXT,
      signal_id TEXT,
      mitigated_at INTEGER,
      resolved_at INTEGER,
      postmortem TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_incidents_space ON incidents (space_id, status, created_at);
    CREATE INDEX IF NOT EXISTS idx_incidents_external ON incidents (space_id, external_id);

    CREATE TABLE IF NOT EXISTS incident_events (
      id TEXT PRIMARY KEY,
      incident_id TEXT NOT NULL,
      kind TEXT NOT NULL,
      text TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_incident_events_incident
      ON incident_events (incident_id, created_at);

    CREATE TABLE IF NOT EXISTS runtime_actions (
      id TEXT PRIMARY KEY,
      incident_id TEXT NOT NULL,
      kind TEXT NOT NULL,
      replicas INTEGER,
      status TEXT NOT NULL,
      proposed_by TEXT NOT NULL,
      reason TEXT NOT NULL,
      output TEXT,
      recovered INTEGER,
      decided_at INTEGER,
      executed_at INTEGER,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_runtime_actions_incident
      ON runtime_actions (incident_id, created_at);
  `);
}

export async function down(_params: MigrationParams<Database.Database>): Promise<void> {
  // Additive migration: new tables are harmless to an older build.
}
