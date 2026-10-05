/**
 * Migration 163: Outcomes (spec 130).
 *
 * - opportunity_outcomes: what happened after an opportunity shipped, one per
 *   opportunity.
 * - opportunities.shipped_at: when it shipped.
 * - signals.told_at: when the signal's customer was told it shipped.
 *
 * Additive and idempotent.
 */

import type { MigrationParams } from 'umzug';
import type Database from 'better-sqlite3';
import { addColumn } from '../add-column.js';

export async function up({ context: db }: MigrationParams<Database.Database>): Promise<void> {
  db.exec(`
    CREATE TABLE IF NOT EXISTS opportunity_outcomes (
      id TEXT PRIMARY KEY,
      opportunity_id TEXT NOT NULL UNIQUE,
      space_id TEXT NOT NULL,
      shipped_at INTEGER NOT NULL,
      review_at INTEGER NOT NULL,
      verdict TEXT NOT NULL,
      signals_before INTEGER,
      signals_after INTEGER,
      judged_at INTEGER,
      actual_review_hours REAL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_opportunity_outcomes_space
      ON opportunity_outcomes (space_id, shipped_at);
    CREATE INDEX IF NOT EXISTS idx_opportunity_outcomes_due
      ON opportunity_outcomes (verdict, review_at);
  `);
  addColumn(db, 'opportunities', 'shipped_at', 'INTEGER');
  addColumn(db, 'signals', 'told_at', 'INTEGER');
}

export async function down(_params: MigrationParams<Database.Database>): Promise<void> {
  // Additive migration: a new table and nullable columns are harmless to an older build.
}
