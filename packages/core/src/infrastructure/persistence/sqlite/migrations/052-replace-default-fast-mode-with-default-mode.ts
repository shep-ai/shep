/**
 * Migration 052: Replace boolean default_fast_mode column with TEXT default_mode column
 * on the settings table.
 *
 * Migrates the settings.default_fast_mode INTEGER column (0/1 boolean) to a TEXT
 * default_mode column that stores FeatureMode enum values:
 *  - default_fast_mode = 1 → default_mode = 'Fast'
 *  - default_fast_mode = 0 → default_mode = 'Regular'
 *
 * Default for new rows: default_mode = 'Fast' (preserves backward compatibility).
 * Guards against duplicate column using PRAGMA table_info.
 */

import type { MigrationParams } from 'umzug';
import type Database from 'better-sqlite3';

export async function up({ context: db }: MigrationParams<Database.Database>): Promise<void> {
  const columns = db.pragma('table_info(settings)') as { name: string }[];
  const names = new Set(columns.map((c) => c.name));

  // Step 1: Add new TEXT default_mode column with default 'Fast'
  if (!names.has('default_mode')) {
    db.exec("ALTER TABLE settings ADD COLUMN default_mode TEXT NOT NULL DEFAULT 'Fast'");
  }

  // Step 2: Migrate data from default_fast_mode → default_mode
  if (names.has('default_fast_mode')) {
    db.exec(`
      UPDATE settings
      SET default_mode = CASE
        WHEN default_fast_mode = 1 THEN 'Fast'
        ELSE 'Regular'
      END
    `);
  }

  // Step 3: Drop old default_fast_mode column
  if (names.has('default_fast_mode')) {
    db.exec('ALTER TABLE settings DROP COLUMN default_fast_mode');
  }
}

export async function down({ context: db }: MigrationParams<Database.Database>): Promise<void> {
  void db;
}
