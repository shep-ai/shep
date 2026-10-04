/**
 * Migration 159: Signals and opportunities (spec 126).
 *
 * - signals: evidence of what users need, owned by a space.
 * - opportunities: bets backed by signals, with a review estimate.
 * - opportunity_weights: a space's own weights and weekly review capacity.
 *
 * Additive and idempotent.
 */

import type { MigrationParams } from 'umzug';
import type Database from 'better-sqlite3';

export async function up({ context: db }: MigrationParams<Database.Database>): Promise<void> {
  db.exec(`
    CREATE TABLE IF NOT EXISTS signals (
      id TEXT PRIMARY KEY,
      space_id TEXT NOT NULL,
      product_line_id TEXT,
      kind TEXT NOT NULL,
      title TEXT NOT NULL,
      detail TEXT,
      customer TEXT,
      monthly_revenue REAL,
      urgent INTEGER NOT NULL DEFAULT 0,
      url TEXT,
      opportunity_id TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_signals_space ON signals (space_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_signals_opportunity ON signals (opportunity_id);

    CREATE TABLE IF NOT EXISTS opportunities (
      id TEXT PRIMARY KEY,
      space_id TEXT NOT NULL,
      product_line_id TEXT,
      title TEXT NOT NULL,
      problem TEXT,
      status TEXT NOT NULL,
      review_hours REAL NOT NULL,
      confidence REAL NOT NULL,
      strategic INTEGER NOT NULL DEFAULT 0,
      work_item_id TEXT,
      decided_at INTEGER,
      drop_reason TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_opportunities_space ON opportunities (space_id, status);

    CREATE TABLE IF NOT EXISTS opportunity_weights (
      space_id TEXT PRIMARY KEY,
      reach REAL NOT NULL,
      revenue REAL NOT NULL,
      urgency REAL NOT NULL,
      strategic REAL NOT NULL,
      weekly_review_hours REAL NOT NULL
    );
  `);
}

export async function down(_params: MigrationParams<Database.Database>): Promise<void> {
  // Additive migration: new tables are harmless to an older build.
}
