/**
 * Migration 061: Add active_plugins column to features table.
 *
 * Stores per-feature plugin activation overrides as a JSON object
 * mapping plugin names to boolean enabled state.
 * Example: {"mempalace": true, "ruflo": false}
 */

import type { MigrationParams } from 'umzug';
import type Database from 'better-sqlite3';

export async function up({ context: db }: MigrationParams<Database.Database>): Promise<void> {
  const columns = db.pragma('table_info(features)') as { name: string }[];
  const names = new Set(columns.map((c) => c.name));

  if (!names.has('active_plugins')) {
    db.exec('ALTER TABLE features ADD COLUMN active_plugins TEXT');
  }
}

export async function down({ context: db }: MigrationParams<Database.Database>): Promise<void> {
  void db;
}
