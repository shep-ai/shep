/**
 * Migration 105: Create services table.
 *
 * Feature 098, phase 2 (Asset & Ownership Model). A Service is an adjacent
 * asset attached to an Application — a sub-process, daemon, or runtime
 * concern that warrants its own finding stream while remaining anchored to
 * the Application for ownership and rollups (research decision 1, FR-2).
 *
 * Findings reference an applicationId AND an optional serviceId.
 *
 * Indexes:
 *  - (application_id) for "services in this application" lookups.
 *  - partial unique (application_id, LOWER(slug)) where slug IS NOT NULL —
 *    slugs are unique within an application but not globally.
 */

import type { MigrationParams } from 'umzug';
import type Database from 'better-sqlite3';

export async function up({ context: db }: MigrationParams<Database.Database>): Promise<void> {
  const tables = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='services'")
    .all() as { name: string }[];

  if (tables.length === 0) {
    db.exec(`
      CREATE TABLE services (
        id              TEXT PRIMARY KEY,
        name            TEXT NOT NULL,
        slug            TEXT,
        application_id  TEXT NOT NULL,
        owner_id        TEXT,
        exposure        TEXT,
        created_at      INTEGER NOT NULL,
        updated_at      INTEGER NOT NULL,
        deleted_at      INTEGER
      )
    `);
  }

  const indexes = db.pragma('index_list(services)') as { name: string }[];
  const indexNames = new Set(indexes.map((i) => i.name));

  if (!indexNames.has('idx_services_application_id')) {
    db.exec(
      'CREATE INDEX idx_services_application_id ON services(application_id) WHERE deleted_at IS NULL'
    );
  }
  if (!indexNames.has('idx_services_app_slug_unique')) {
    db.exec(
      'CREATE UNIQUE INDEX idx_services_app_slug_unique ON services(application_id, LOWER(slug)) WHERE slug IS NOT NULL AND deleted_at IS NULL'
    );
  }
}

export async function down({ context: db }: MigrationParams<Database.Database>): Promise<void> {
  db.exec('DROP TABLE IF EXISTS services');
}
