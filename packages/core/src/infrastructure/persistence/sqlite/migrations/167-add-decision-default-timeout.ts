/**
 * Migration 167: settings.workflow_decision_default_timeout_minutes (spec 134).
 *
 * Minutes a background agent's question waits before the agent proceeds with
 * its recommended option. NULL means the default (30). Additive and idempotent.
 */

import type { MigrationParams } from 'umzug';
import type Database from 'better-sqlite3';
import { addColumn } from '../add-column.js';

export async function up({ context: db }: MigrationParams<Database.Database>): Promise<void> {
  addColumn(db, 'settings', 'workflow_decision_default_timeout_minutes', 'INTEGER');
}

export async function down(_params: MigrationParams<Database.Database>): Promise<void> {
  // Additive migration: a nullable column is harmless to an older build.
}
