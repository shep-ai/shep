/**
 * Migration 151: Query-aware harness settings (spec 119).
 *
 * - settings.feature_flag_query_aware_harness (INTEGER, default 0) — the
 *   experimental flag gating the Shep Harness agent and its surfaces.
 * - settings.harness_config (TEXT, nullable) — `Settings.harness` as JSON.
 *   NULL means "all defaults"; every reader normalizes through
 *   `resolveHarnessConfig`, so a partial or older JSON value can never reach
 *   the runtime with missing keys or inverted visibility bands.
 *
 * Additive only and guarded by PRAGMA so re-running is a no-op.
 */

import type { MigrationParams } from 'umzug';
import type Database from 'better-sqlite3';

function columnNames(db: Database.Database, table: string): Set<string> {
  const columns = db.pragma(`table_info(${table})`) as { name: string }[];
  return new Set(columns.map((c) => c.name));
}

export async function up({ context: db }: MigrationParams<Database.Database>): Promise<void> {
  const existing = columnNames(db, 'settings');
  if (!existing.has('feature_flag_query_aware_harness')) {
    db.exec(
      'ALTER TABLE settings ADD COLUMN feature_flag_query_aware_harness INTEGER NOT NULL DEFAULT 0'
    );
  }
  if (!existing.has('harness_config')) {
    db.exec('ALTER TABLE settings ADD COLUMN harness_config TEXT');
  }
}

export async function down({ context: db }: MigrationParams<Database.Database>): Promise<void> {
  void db;
}
