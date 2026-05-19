/**
 * Migration 106: Create api_assets table.
 *
 * Feature 098, phase 2. An ApiAsset represents an external- or internal-facing
 * API surface attached to an Application (research decision 1, FR-2). API
 * findings (e.g. broken auth, schema drift) reference both the application
 * and the api asset for targeted triage.
 *
 * `schema_path` is stored with POSIX separators (NFR-11) — callers must
 * normalize before writing.
 *
 * Indexes:
 *  - (application_id) for "api assets in this application" lookups.
 *  - partial unique (application_id, LOWER(name)) where deleted_at IS NULL —
 *    names are unique within an application.
 */

import type { MigrationParams } from 'umzug';
import type Database from 'better-sqlite3';

export async function up({ context: db }: MigrationParams<Database.Database>): Promise<void> {
  const tables = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='api_assets'")
    .all() as { name: string }[];

  if (tables.length === 0) {
    db.exec(`
      CREATE TABLE api_assets (
        id              TEXT PRIMARY KEY,
        name            TEXT NOT NULL,
        base_url        TEXT,
        application_id  TEXT NOT NULL,
        owner_id        TEXT,
        exposure        TEXT,
        schema_path     TEXT,
        created_at      INTEGER NOT NULL,
        updated_at      INTEGER NOT NULL,
        deleted_at      INTEGER
      )
    `);
  }

  const indexes = db.pragma('index_list(api_assets)') as { name: string }[];
  const indexNames = new Set(indexes.map((i) => i.name));

  if (!indexNames.has('idx_api_assets_application_id')) {
    db.exec(
      'CREATE INDEX idx_api_assets_application_id ON api_assets(application_id) WHERE deleted_at IS NULL'
    );
  }
  if (!indexNames.has('idx_api_assets_app_name_unique')) {
    db.exec(
      'CREATE UNIQUE INDEX idx_api_assets_app_name_unique ON api_assets(application_id, LOWER(name)) WHERE deleted_at IS NULL'
    );
  }
}

export async function down({ context: db }: MigrationParams<Database.Database>): Promise<void> {
  db.exec('DROP TABLE IF EXISTS api_assets');
}
