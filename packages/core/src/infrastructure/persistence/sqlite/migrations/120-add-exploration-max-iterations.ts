/**
 * Migration 053: Add exploration_max_iterations column to the settings table.
 *
 * Adds a nullable INTEGER column for the maximum number of feedback iterations
 * in exploration mode. When NULL, the default of 10 is applied at the application layer.
 * Guards against duplicate column using PRAGMA table_info.
 */

import type { MigrationParams } from 'umzug';
import type Database from 'better-sqlite3';

export async function up({ context: db }: MigrationParams<Database.Database>): Promise<void> {
  const columns = db.pragma('table_info(settings)') as { name: string }[];
  const names = new Set(columns.map((c) => c.name));

  if (!names.has('exploration_max_iterations')) {
    db.exec('ALTER TABLE settings ADD COLUMN exploration_max_iterations INTEGER');
  }
}

export async function down({ context: db }: MigrationParams<Database.Database>): Promise<void> {
  void db;
}
