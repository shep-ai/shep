/**
 * Migration 172: the agent coordination feature flag (spec 141).
 *
 * Agent coordination of overlapping features moves behind
 * `feature_flag_agent_coordination`. It defaults to 0, so no agent judges
 * overlapping features until a user turns it on from /settings/feature-flags
 * or `shep settings flags`.
 *
 * Additive and idempotent.
 */

import type { MigrationParams } from 'umzug';
import type Database from 'better-sqlite3';
import { addColumn } from '../add-column.js';

export async function up({ context: db }: MigrationParams<Database.Database>): Promise<void> {
  addColumn(db, 'settings', 'feature_flag_agent_coordination', 'INTEGER NOT NULL DEFAULT 0');
}

export async function down(_params: MigrationParams<Database.Database>): Promise<void> {
  // Additive migration: a column with a default is harmless to an older build.
}
