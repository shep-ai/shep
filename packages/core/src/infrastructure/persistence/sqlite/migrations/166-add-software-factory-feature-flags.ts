/**
 * Migration 166: one feature flag per software-factory area (spec 135).
 *
 * Specs 120–132 shipped with no flag. Each area — spaces, trackers, knowledge,
 * signals, opportunities, feedback, discovery, incidents, outcomes, docs
 * first, autopilot and factory — gets a `feature_flag_*` column. They default
 * to 1 so existing installs keep every area they already have.
 *
 * Additive and idempotent.
 */

import type { MigrationParams } from 'umzug';
import type Database from 'better-sqlite3';
import { addColumn } from '../add-column.js';

const FLAG_COLUMNS = [
  'feature_flag_spaces',
  'feature_flag_trackers',
  'feature_flag_knowledge',
  'feature_flag_signals',
  'feature_flag_opportunities',
  'feature_flag_feedback',
  'feature_flag_discovery',
  'feature_flag_incidents',
  'feature_flag_outcomes',
  'feature_flag_docs_first',
  'feature_flag_autopilot',
  'feature_flag_factory',
] as const;

export async function up({ context: db }: MigrationParams<Database.Database>): Promise<void> {
  for (const column of FLAG_COLUMNS) {
    addColumn(db, 'settings', column, 'INTEGER NOT NULL DEFAULT 1');
  }
}

export async function down(_params: MigrationParams<Database.Database>): Promise<void> {
  // Additive migration: columns with defaults are harmless to an older build.
}
