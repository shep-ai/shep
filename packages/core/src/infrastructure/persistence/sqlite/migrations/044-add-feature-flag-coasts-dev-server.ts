/**
 * Migration 044: Add feature_flag_coasts_dev_server column to settings table.
 *
 * Adds a boolean (INTEGER 0/1) column for the Coasts dev server feature flag.
 * Defaults to 0 (disabled).
 */

import type { MigrationParams } from 'umzug';
import type Database from 'better-sqlite3';

export async function up({ context: db }: MigrationParams<Database.Database>): Promise<void> {
  const columns = db.pragma('table_info(settings)') as { name: string }[];
  const existing = new Set(columns.map((c) => c.name));

  if (!existing.has('feature_flag_coasts_dev_server')) {
    db.exec(
      'ALTER TABLE settings ADD COLUMN feature_flag_coasts_dev_server INTEGER NOT NULL DEFAULT 0'
    );
  }
}

export async function down({ context: db }: MigrationParams<Database.Database>): Promise<void> {
  // SQLite does not support DROP COLUMN before 3.35.0; column remains but is unused after rollback.
  void db;
}
