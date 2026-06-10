/**
 * Migration 135: Add default_mode column to the settings table.
 *
 * PR #513 (exploration mode) introduced `workflow.defaultMode` (a BuildMode
 * string: Regular / Fast / Exploration) which the settings mapper and
 * repository read/write as the `default_mode` column. Its original migration
 * was superseded during the multi-PR integration (main retains the legacy
 * `fast` flag rather than the boolean->enum migration), leaving the column
 * referenced by the repository but never created. This restores it.
 *
 * Nullable TEXT; when NULL the application layer falls back to 'Fast'
 * (see settings.mapper.ts). Guarded against duplicate column via PRAGMA.
 */

import type { MigrationParams } from 'umzug';
import type Database from 'better-sqlite3';

export async function up({ context: db }: MigrationParams<Database.Database>): Promise<void> {
  const columns = db.pragma('table_info(settings)') as { name: string }[];
  const names = new Set(columns.map((c) => c.name));

  if (!names.has('default_mode')) {
    db.exec('ALTER TABLE settings ADD COLUMN default_mode TEXT');
  }
}

export async function down({ context: db }: MigrationParams<Database.Database>): Promise<void> {
  void db;
}
