/**
 * Migration 116: Add feature_flag_aspm column to settings table (spec 098).
 *
 * Adds a boolean (INTEGER 0/1) column for the Application Security Posture
 * Management module feature flag. Defaults to 0 (disabled) so existing
 * installations behave identically until the user opts in. The flag gates
 * the /aspm web routes, the `shep aspm` CLI command tree, and the
 * /api/aspm/posture/stream SSE route.
 */

import type { MigrationParams } from 'umzug';
import type Database from 'better-sqlite3';

export async function up({ context: db }: MigrationParams<Database.Database>): Promise<void> {
  const columns = db.pragma('table_info(settings)') as { name: string }[];
  const existing = new Set(columns.map((c) => c.name));

  if (!existing.has('feature_flag_aspm')) {
    db.exec('ALTER TABLE settings ADD COLUMN feature_flag_aspm INTEGER NOT NULL DEFAULT 0');
  }
}

export async function down({ context: db }: MigrationParams<Database.Database>): Promise<void> {
  // SQLite does not support DROP COLUMN before 3.35.0; column remains but is unused after rollback.
  void db;
}
