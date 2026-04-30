/**
 * Migration 095: Add default_home_page column to the settings table.
 *
 * Stores the user's preferred landing page when opening the web UI.
 * Defaults to 'control-center' so existing users land on the Control Center
 * canvas instead of the Applications list.
 *
 * Idempotent: only adds the column if it is not already present.
 */

import type { MigrationParams } from 'umzug';
import type Database from 'better-sqlite3';

export async function up({ context: db }: MigrationParams<Database.Database>): Promise<void> {
  const columns = db.pragma('table_info(settings)') as { name: string }[];
  const exists = columns.some((c) => c.name === 'default_home_page');
  if (!exists) {
    db.exec(
      `ALTER TABLE settings ADD COLUMN default_home_page TEXT NOT NULL DEFAULT 'control-center'`
    );
  }
}

export async function down({ context: db }: MigrationParams<Database.Database>): Promise<void> {
  void db;
}
