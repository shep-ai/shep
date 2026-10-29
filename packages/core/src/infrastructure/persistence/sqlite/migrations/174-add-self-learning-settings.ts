/**
 * Migration 174: self-learning harness settings (spec 150).
 *
 * `feature_flag_self_learning` defaults to 0, so nothing learns until a user
 * turns it on. `learning_config` holds LearningConfig as JSON; NULL means every
 * default (mode Off, Manual adoption), resolved by `resolveLearningConfig`.
 *
 * Additive and idempotent.
 */

import type { MigrationParams } from 'umzug';
import type Database from 'better-sqlite3';
import { addColumn } from '../add-column.js';

export async function up({ context: db }: MigrationParams<Database.Database>): Promise<void> {
  addColumn(db, 'settings', 'feature_flag_self_learning', 'INTEGER NOT NULL DEFAULT 0');
  addColumn(db, 'settings', 'learning_config', 'TEXT');
}

export async function down(_params: MigrationParams<Database.Database>): Promise<void> {
  // Additive migration: columns with defaults are harmless to an older build.
}
