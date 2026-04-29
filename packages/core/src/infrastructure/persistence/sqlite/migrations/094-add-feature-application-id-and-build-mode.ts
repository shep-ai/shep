/**
 * Migration 094: Add application_id + build_mode columns to features table.
 *
 * Supports the control-center-sdd-mode flow which lets a user launch a
 * new spec-driven feature scoped to an existing Application:
 *
 *  - application_id (TEXT, nullable): parent Application reference.
 *    Nullable because legacy features have no application link.
 *
 *  - build_mode (TEXT NOT NULL DEFAULT 'application'): persisted SDLC
 *    pipeline selector ('application' | 'fast' | 'spec'). Backfilled
 *    from the legacy `fast` boolean: rows with `fast = 1` are promoted
 *    to 'fast'; everything else stays 'application'.
 *
 * Idempotency: each ALTER TABLE is guarded by `pragma table_info`, and
 * the backfill UPDATE is bounded by `WHERE build_mode = 'application'`
 * so re-runs do not downgrade rows that were already promoted.
 *
 * `down()` is a no-op (matches the project's no-rollback migration
 * convention used by 044, 049, 054, etc.).
 */

import type { MigrationParams } from 'umzug';
import type Database from 'better-sqlite3';

export async function up({ context: db }: MigrationParams<Database.Database>): Promise<void> {
  const columns = db.pragma('table_info(features)') as { name: string }[];
  const names = new Set(columns.map((c) => c.name));

  if (!names.has('application_id')) {
    db.exec('ALTER TABLE features ADD COLUMN application_id TEXT');
  }

  if (!names.has('build_mode')) {
    db.exec(`ALTER TABLE features ADD COLUMN build_mode TEXT NOT NULL DEFAULT 'application'`);
  }

  // Backfill build_mode from the legacy `fast` flag for rows that still
  // hold the column default. Bounded WHERE clause keeps the UPDATE
  // idempotent across re-runs and bootstrap-repair scenarios. Only run
  // when the legacy column is present — defensive guard for any future
  // database that might predate `fast`.
  const refreshed = db.pragma('table_info(features)') as { name: string }[];
  const hasFast = refreshed.some((c) => c.name === 'fast');
  if (hasFast) {
    db.exec(
      `UPDATE features
         SET build_mode = CASE WHEN fast = 1 THEN 'fast' ELSE 'application' END
         WHERE build_mode = 'application'`
    );
  }
}

export async function down({ context: db }: MigrationParams<Database.Database>): Promise<void> {
  void db;
}
