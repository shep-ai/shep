/**
 * Migration 122: Add feature_flag_supply_chain_security column to settings table.
 *
 * Adds a boolean (INTEGER 0/1) master kill switch for the supply chain security
 * feature. Defaults to 1 (enabled) to preserve behavior for users who already
 * have the feature running in Advisory mode.
 *
 * When this flag is 0, the entire feature goes inert: no badge on the canvas,
 * no Settings section, no agent pre-check, no CLI enforce, no CI gate —
 * regardless of the SecurityMode value in the security config.
 */

import type { MigrationParams } from 'umzug';
import type Database from 'better-sqlite3';

export async function up({ context: db }: MigrationParams<Database.Database>): Promise<void> {
  const columns = db.pragma('table_info(settings)') as { name: string }[];
  const existing = new Set(columns.map((c) => c.name));

  if (!existing.has('feature_flag_supply_chain_security')) {
    db.exec(
      'ALTER TABLE settings ADD COLUMN feature_flag_supply_chain_security INTEGER NOT NULL DEFAULT 1'
    );
  }
}

export async function down({ context: db }: MigrationParams<Database.Database>): Promise<void> {
  // SQLite does not support DROP COLUMN before 3.35.0; column remains but is unused after rollback.
  void db;
}
