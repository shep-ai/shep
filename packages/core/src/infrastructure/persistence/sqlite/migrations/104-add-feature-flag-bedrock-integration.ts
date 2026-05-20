/**
 * Migration 104: Add feature_flag_bedrock_integration column to settings table.
 *
 * Adds a boolean (INTEGER 0/1) column gating the project-bedrock memory
 * integration UI and server actions (spec 098). Defaults to 1 so the
 * feature is enabled by default for every installation; users can opt out
 * from Settings → Feature Flags.
 *
 * Idempotency: the ALTER TABLE is guarded by `pragma table_info` so the
 * migration is safe to re-run.
 *
 * `down()` is a no-op (matches the no-rollback convention used by every
 * other feature-flag migration in this project, e.g. 085, 091).
 */

import type { MigrationParams } from 'umzug';
import type Database from 'better-sqlite3';

export async function up({ context: db }: MigrationParams<Database.Database>): Promise<void> {
  const columns = db.pragma('table_info(settings)') as { name: string }[];
  const existing = new Set(columns.map((c) => c.name));

  if (!existing.has('feature_flag_bedrock_integration')) {
    db.exec(
      'ALTER TABLE settings ADD COLUMN feature_flag_bedrock_integration INTEGER NOT NULL DEFAULT 1'
    );
  }
}

export async function down({ context: db }: MigrationParams<Database.Database>): Promise<void> {
  void db;
}
