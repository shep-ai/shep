/**
 * Migration 117: Flip projects / codeReview / collaboration / aspm feature flags
 * on by default for existing installs.
 *
 * Migrations 092 (projects), 102 (codeReview), 105 (collaboration), and 116 (aspm)
 * each added their column with `DEFAULT 0`. The factory default has now been changed
 * to `true` for all four (see settings-defaults.factory.ts), so new installs get them
 * enabled out of the box. Existing installs would still see them off because the
 * settings row was persisted under the old defaults — this migration backfills.
 *
 * Per the LESSONS.md "Backward Compatible" rule we only add data, never drop. The
 * UPDATE is gated on the row still being at the original DEFAULT 0 so a user who
 * has explicitly toggled a flag off keeps that intent. Down is a no-op because
 * the original state isn't recoverable from the new state.
 */

import type { MigrationParams } from 'umzug';
import type Database from 'better-sqlite3';

const COLUMNS = [
  'feature_flag_projects',
  'feature_flag_code_review',
  'feature_flag_collaboration',
  'feature_flag_aspm',
] as const;

export async function up({ context: db }: MigrationParams<Database.Database>): Promise<void> {
  const tableColumns = db.pragma('table_info(settings)') as { name: string }[];
  const existing = new Set(tableColumns.map((c) => c.name));

  for (const column of COLUMNS) {
    if (!existing.has(column)) continue;
    db.exec(`UPDATE settings SET ${column} = 1 WHERE ${column} = 0`);
  }
}

export async function down({ context: db }: MigrationParams<Database.Database>): Promise<void> {
  // Cannot tell which rows we flipped from which the user explicitly enabled,
  // so down stays a no-op (per project convention).
  void db;
}
