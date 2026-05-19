/**
 * Migration 104: Create business_units table.
 *
 * Feature 098, phase 2. BusinessUnits are the coarsest ASPM rollup
 * grouping — Teams roll up into BusinessUnits, Owners roll up into Teams
 * (research decision 1, FR-3). Single-workspace MVP: BU is a grouping
 * field, not a hard scope (research decision 13).
 *
 * Indexes:
 *  - partial unique (LOWER(slug)) where slug IS NOT NULL — stable lookup.
 */

import type { MigrationParams } from 'umzug';
import type Database from 'better-sqlite3';

export async function up({ context: db }: MigrationParams<Database.Database>): Promise<void> {
  const tables = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='business_units'")
    .all() as { name: string }[];

  if (tables.length === 0) {
    db.exec(`
      CREATE TABLE business_units (
        id          TEXT PRIMARY KEY,
        name        TEXT NOT NULL,
        slug        TEXT,
        created_at  INTEGER NOT NULL,
        updated_at  INTEGER NOT NULL,
        deleted_at  INTEGER
      )
    `);
  }

  const indexes = db.pragma('index_list(business_units)') as { name: string }[];
  const indexNames = new Set(indexes.map((i) => i.name));

  if (!indexNames.has('idx_business_units_slug_unique')) {
    db.exec(
      'CREATE UNIQUE INDEX idx_business_units_slug_unique ON business_units(LOWER(slug)) WHERE slug IS NOT NULL AND deleted_at IS NULL'
    );
  }
}

export async function down({ context: db }: MigrationParams<Database.Database>): Promise<void> {
  db.exec('DROP TABLE IF EXISTS business_units');
}
