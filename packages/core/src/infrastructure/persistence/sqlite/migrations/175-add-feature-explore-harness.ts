/**
 * Migration 175: per-feature Explore override (spec 150).
 *
 * `explore_harness` (0/1) runs one feature's implement phase in Explore mode
 * whatever the scope's learning mode; `explore_k` is that feature's budget.
 * Both NULL for every existing feature, which means "follow the settings".
 *
 * Additive and idempotent.
 */

import type { MigrationParams } from 'umzug';
import type Database from 'better-sqlite3';
import { addColumn } from '../add-column.js';

export async function up({ context: db }: MigrationParams<Database.Database>): Promise<void> {
  addColumn(db, 'features', 'explore_harness', 'INTEGER');
  addColumn(db, 'features', 'explore_k', 'INTEGER');
}

export async function down(_params: MigrationParams<Database.Database>): Promise<void> {
  // Additive migration: nullable columns are harmless to an older build.
}
