/**
 * Migration 142: Add adaptive model selection columns to the settings table.
 *
 * Backs `settings.models.adaptive` (AdaptiveModelConfig): a master toggle plus
 * three optional per-tier model overrides. When the toggle is off — the default
 * for every existing row — the feature agent keeps running every task on
 * `model_default`, so this migration changes no behaviour on its own.
 *
 * The three override columns are nullable: NULL means "derive the tier model
 * from the pinned model's family", which is what `domain/shared/model-tier.ts`
 * does when no override is supplied.
 *
 * Additive only and guarded by PRAGMA so re-running is a no-op.
 */

import type { MigrationParams } from 'umzug';
import type Database from 'better-sqlite3';

export async function up({ context: db }: MigrationParams<Database.Database>): Promise<void> {
  const columns = db.pragma('table_info(settings)') as { name: string }[];
  const names = new Set(columns.map((c) => c.name));

  if (!names.has('model_adaptive_enabled')) {
    db.exec('ALTER TABLE settings ADD COLUMN model_adaptive_enabled INTEGER NOT NULL DEFAULT 0');
  }
  if (!names.has('model_adaptive_high')) {
    db.exec('ALTER TABLE settings ADD COLUMN model_adaptive_high TEXT');
  }
  if (!names.has('model_adaptive_medium')) {
    db.exec('ALTER TABLE settings ADD COLUMN model_adaptive_medium TEXT');
  }
  if (!names.has('model_adaptive_low')) {
    db.exec('ALTER TABLE settings ADD COLUMN model_adaptive_low TEXT');
  }
}

export async function down({ context: db }: MigrationParams<Database.Database>): Promise<void> {
  void db;
}
