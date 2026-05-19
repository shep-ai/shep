/**
 * Migration 103: Create teams table.
 *
 * Feature 098, phase 2. Teams group Owners and optionally roll up into a
 * BusinessUnit for ASPM posture dashboards (research decision 1, FR-3).
 *
 * Indexes:
 *  - partial unique (LOWER(slug)) where slug IS NOT NULL — for stable lookup.
 *  - (business_unit_id) for "teams in this BU" rollups.
 */

import type { MigrationParams } from 'umzug';
import type Database from 'better-sqlite3';

export async function up({ context: db }: MigrationParams<Database.Database>): Promise<void> {
  const tables = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='teams'")
    .all() as { name: string }[];

  if (tables.length === 0) {
    db.exec(`
      CREATE TABLE teams (
        id                TEXT PRIMARY KEY,
        name              TEXT NOT NULL,
        slug              TEXT,
        business_unit_id  TEXT,
        created_at        INTEGER NOT NULL,
        updated_at        INTEGER NOT NULL,
        deleted_at        INTEGER
      )
    `);
  }

  const indexes = db.pragma('index_list(teams)') as { name: string }[];
  const indexNames = new Set(indexes.map((i) => i.name));

  if (!indexNames.has('idx_teams_slug_unique')) {
    db.exec(
      'CREATE UNIQUE INDEX idx_teams_slug_unique ON teams(LOWER(slug)) WHERE slug IS NOT NULL AND deleted_at IS NULL'
    );
  }
  if (!indexNames.has('idx_teams_business_unit_id')) {
    db.exec(
      'CREATE INDEX idx_teams_business_unit_id ON teams(business_unit_id) WHERE deleted_at IS NULL'
    );
  }
}

export async function down({ context: db }: MigrationParams<Database.Database>): Promise<void> {
  db.exec('DROP TABLE IF EXISTS teams');
}
