/**
 * Migration 094: Drop graduated feature flag columns from the settings table.
 *
 * The flags `skills`, `githubImport`, `adoptBranch`, `gitRebaseSync`, and
 * `inventory` have graduated out of feature-flag gating — they are now
 * always enabled. Drop the corresponding columns so the schema reflects
 * the new shape and the mapper does not need to keep reading dead values.
 *
 * Idempotent: only drops a column if it is currently present.
 * Requires SQLite >= 3.35.0 for native DROP COLUMN. better-sqlite3
 * ships a recent SQLite, but the operation is wrapped in try/catch
 * just in case to avoid breaking startup on an older binary.
 */

import type { MigrationParams } from 'umzug';
import type Database from 'better-sqlite3';

const COLUMNS_TO_DROP = [
  'feature_flag_skills',
  'feature_flag_github_import',
  'feature_flag_adopt_branch',
  'feature_flag_git_rebase_sync',
  'feature_flag_inventory',
];

export async function up({ context: db }: MigrationParams<Database.Database>): Promise<void> {
  const columns = db.pragma('table_info(settings)') as { name: string }[];
  const existing = new Set(columns.map((c) => c.name));

  for (const col of COLUMNS_TO_DROP) {
    if (existing.has(col)) {
      try {
        db.exec(`ALTER TABLE settings DROP COLUMN ${col}`);
      } catch {
        // SQLite < 3.35 does not support DROP COLUMN — leave the column in
        // place. The mapper no longer reads it, so it is harmless.
      }
    }
  }
}

export async function down({ context: db }: MigrationParams<Database.Database>): Promise<void> {
  // Down-migration intentionally left empty: re-adding the columns would
  // resurrect the flags as disabled (default 0), which is the opposite of
  // the new always-on behavior. A user wanting to undo this should restore
  // the previous TypeSpec model and roll forward through migration 094.
  void db;
}
