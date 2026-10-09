/**
 * Migration 166: Telemetry outbox and preferences (spec 133).
 *
 * - telemetry_outbox: usage events waiting to be sent by the daemon, with
 *   per-entry retry state.
 * - telemetry_once: hashed once-keys, so an event several detectors observe
 *   (a PR merge) is recorded once across processes.
 * - settings.telemetry_*: the user's preferences, the install id, and when
 *   the notice and the last heartbeat happened.
 *
 * Additive and idempotent.
 */

import type { MigrationParams } from 'umzug';
import type Database from 'better-sqlite3';
import { addColumn } from '../add-column.js';

export async function up({ context: db }: MigrationParams<Database.Database>): Promise<void> {
  db.exec(`
    CREATE TABLE IF NOT EXISTS telemetry_outbox (
      id TEXT PRIMARY KEY,
      event TEXT NOT NULL,
      properties TEXT NOT NULL,
      captured_at INTEGER NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0,
      next_attempt_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_telemetry_outbox_due
      ON telemetry_outbox (next_attempt_at, captured_at);
    CREATE TABLE IF NOT EXISTS telemetry_once (
      key_hash TEXT PRIMARY KEY,
      claimed_at INTEGER NOT NULL
    );
  `);
  addColumn(db, 'settings', 'telemetry_enabled', 'INTEGER NOT NULL DEFAULT 1');
  addColumn(db, 'settings', 'telemetry_include_identity', 'INTEGER NOT NULL DEFAULT 1');
  addColumn(db, 'settings', 'telemetry_contact_consent', 'INTEGER NOT NULL DEFAULT 0');
  addColumn(db, 'settings', 'telemetry_install_id', 'TEXT');
  addColumn(db, 'settings', 'telemetry_notice_shown_at', 'TEXT');
  addColumn(db, 'settings', 'telemetry_last_heartbeat_at', 'TEXT');
}

export async function down(_params: MigrationParams<Database.Database>): Promise<void> {
  // Additive migration: new tables and defaulted columns are harmless to an older build.
}
