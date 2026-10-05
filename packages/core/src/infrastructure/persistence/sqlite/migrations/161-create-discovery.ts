/**
 * Migration 161: Discovery (spec 128).
 *
 * - discovery_runs: each pass of the discovery agent over a space.
 * - opportunities.source and .brief: how an opportunity came to be, and the
 *   agent's outline for a discovered one.
 * - opportunity_weights.discovery_every_hours: a space's discovery schedule.
 *
 * Additive and idempotent.
 */

import type { MigrationParams } from 'umzug';
import type Database from 'better-sqlite3';
import { addColumn } from '../add-column.js';

export async function up({ context: db }: MigrationParams<Database.Database>): Promise<void> {
  db.exec(`
    CREATE TABLE IF NOT EXISTS discovery_runs (
      id TEXT PRIMARY KEY,
      space_id TEXT NOT NULL,
      status TEXT NOT NULL,
      agent_type TEXT,
      signals_read INTEGER NOT NULL DEFAULT 0,
      proposed INTEGER NOT NULL DEFAULT 0,
      dropped INTEGER NOT NULL DEFAULT 0,
      finished_at INTEGER,
      error TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_discovery_runs_space ON discovery_runs (space_id, created_at);
  `);
  addColumn(db, 'opportunities', 'source', 'TEXT');
  addColumn(db, 'opportunities', 'brief', 'TEXT');
  addColumn(db, 'opportunity_weights', 'discovery_every_hours', 'REAL');
}

export async function down(_params: MigrationParams<Database.Database>): Promise<void> {
  // Additive migration: a new table and nullable columns are harmless to an older build.
}
