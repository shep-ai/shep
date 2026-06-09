/**
 * Migration 102: Create owners table.
 *
 * Feature 098, phase 2 (Asset & Ownership Model). An Owner is a person or
 * team identifier responsible for assets and findings (research decision 4).
 * Optionally references a team for rollups; soft-deletable for audit.
 *
 * Indexes:
 *  - (team_id) for "owners on this team" lookups during posture rollups.
 *  - partial unique (LOWER(handle)) where handle IS NOT NULL — at most one
 *    owner per contact handle, so YAML imports can dedupe by handle.
 *
 * Idempotent: CREATE TABLE IF NOT EXISTS, plus pragma index_list checks.
 */

import type { MigrationParams } from 'umzug';
import type Database from 'better-sqlite3';

export async function up({ context: db }: MigrationParams<Database.Database>): Promise<void> {
  const tables = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='owners'")
    .all() as { name: string }[];

  if (tables.length === 0) {
    db.exec(`
      CREATE TABLE owners (
        id          TEXT PRIMARY KEY,
        name        TEXT NOT NULL,
        handle      TEXT,
        team_id     TEXT,
        notes       TEXT,
        created_at  INTEGER NOT NULL,
        updated_at  INTEGER NOT NULL,
        deleted_at  INTEGER
      )
    `);
  }

  const indexes = db.pragma('index_list(owners)') as { name: string }[];
  const indexNames = new Set(indexes.map((i) => i.name));

  if (!indexNames.has('idx_owners_team_id')) {
    db.exec('CREATE INDEX idx_owners_team_id ON owners(team_id) WHERE deleted_at IS NULL');
  }
  if (!indexNames.has('idx_owners_handle_unique')) {
    db.exec(
      'CREATE UNIQUE INDEX idx_owners_handle_unique ON owners(LOWER(handle)) WHERE handle IS NOT NULL AND deleted_at IS NULL'
    );
  }
}

export async function down({ context: db }: MigrationParams<Database.Database>): Promise<void> {
  db.exec('DROP TABLE IF EXISTS owners');
}
