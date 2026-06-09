/**
 * Migration 107: Create cloud_environments table.
 *
 * Feature 098, phase 2. A CloudEnvironment represents a deployment target /
 * cloud account / cloud project linked to an Application (research decision 1,
 * FR-2). Cloud-domain findings (e.g. IaC misconfigurations, runtime cloud
 * posture) reference both the application and the cloud environment.
 *
 * Indexes:
 *  - (application_id) for "cloud envs in this application" lookups.
 *  - (provider, account_id) for "find env by provider/account".
 */

import type { MigrationParams } from 'umzug';
import type Database from 'better-sqlite3';

export async function up({ context: db }: MigrationParams<Database.Database>): Promise<void> {
  const tables = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='cloud_environments'")
    .all() as { name: string }[];

  if (tables.length === 0) {
    db.exec(`
      CREATE TABLE cloud_environments (
        id              TEXT PRIMARY KEY,
        name            TEXT NOT NULL,
        provider        TEXT NOT NULL,
        account_id      TEXT,
        application_id  TEXT NOT NULL,
        owner_id        TEXT,
        region          TEXT,
        created_at      INTEGER NOT NULL,
        updated_at      INTEGER NOT NULL,
        deleted_at      INTEGER
      )
    `);
  }

  const indexes = db.pragma('index_list(cloud_environments)') as { name: string }[];
  const indexNames = new Set(indexes.map((i) => i.name));

  if (!indexNames.has('idx_cloud_environments_application_id')) {
    db.exec(
      'CREATE INDEX idx_cloud_environments_application_id ON cloud_environments(application_id) WHERE deleted_at IS NULL'
    );
  }
  if (!indexNames.has('idx_cloud_environments_provider_account')) {
    db.exec(
      'CREATE INDEX idx_cloud_environments_provider_account ON cloud_environments(provider, account_id) WHERE deleted_at IS NULL'
    );
  }
}

export async function down({ context: db }: MigrationParams<Database.Database>): Promise<void> {
  db.exec('DROP TABLE IF EXISTS cloud_environments');
}
