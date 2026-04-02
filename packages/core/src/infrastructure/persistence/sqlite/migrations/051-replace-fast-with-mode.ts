/**
 * Migration 051: Replace boolean fast column with TEXT mode column on features table.
 *
 * Migrates the features.fast INTEGER column (0/1 boolean) to a TEXT mode column
 * that stores FeatureMode enum values: 'Regular' (was 0), 'Fast' (was 1), 'Exploration'.
 * Also adds iteration_count and max_iterations columns for exploration feedback loops.
 *
 * Transformation logic:
 *  - fast = 0 → mode = 'Regular'
 *  - fast = 1 → mode = 'Fast'
 *
 * Default for new rows: mode = 'Regular', iteration_count = 0, max_iterations = NULL.
 * Guards against duplicate column/dropped column using PRAGMA table_info.
 */

import type { MigrationParams } from 'umzug';
import type Database from 'better-sqlite3';

export async function up({ context: db }: MigrationParams<Database.Database>): Promise<void> {
  const columns = db.pragma('table_info(features)') as { name: string }[];
  const names = new Set(columns.map((c) => c.name));

  // Step 1: Add new TEXT mode column with default 'Regular'
  if (!names.has('mode')) {
    db.exec("ALTER TABLE features ADD COLUMN mode TEXT NOT NULL DEFAULT 'Regular'");
  }

  // Step 2: Migrate data from fast → mode (only if fast column still exists)
  if (names.has('fast')) {
    db.exec(`
      UPDATE features
      SET mode = CASE
        WHEN fast = 1 THEN 'Fast'
        ELSE 'Regular'
      END
    `);
  }

  // Step 3: Drop old fast column
  if (names.has('fast')) {
    db.exec('ALTER TABLE features DROP COLUMN fast');
  }

  // Step 4: Add iteration tracking columns for exploration mode
  if (!names.has('iteration_count')) {
    db.exec('ALTER TABLE features ADD COLUMN iteration_count INTEGER NOT NULL DEFAULT 0');
  }

  if (!names.has('max_iterations')) {
    db.exec('ALTER TABLE features ADD COLUMN max_iterations INTEGER');
  }
}

export async function down({ context: db }: MigrationParams<Database.Database>): Promise<void> {
  void db;
}
