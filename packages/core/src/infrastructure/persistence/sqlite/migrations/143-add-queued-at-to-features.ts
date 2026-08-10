/**
 * Migration 143: Add the capacity-queue marker to the features table.
 *
 * - queued_at (INTEGER, nullable): when the feature was queued because the
 *   parallel-feature limit was reached, as epoch milliseconds. Cleared when the
 *   feature is admitted. INTEGER rather than TEXT to match created_at and
 *   deleted_at on this table — the FIFO drain orders by this column, and mixing
 *   storage types would make that ordering depend on the format.
 *
 * Nullable with no backfill: every existing feature either already started or
 * was deferred by the user, and neither is capacity-queued.
 *
 * The partial index serves the FIFO drain scan, which only ever looks at rows
 * with a non-null queued_at — a full index would carry every other feature for
 * nothing. Counting running features is already served by idx_features_lifecycle
 * (created in the legacy schema), so no additional index is needed for that.
 */

import type { MigrationParams } from 'umzug';
import type Database from 'better-sqlite3';

export async function up({ context: db }: MigrationParams<Database.Database>): Promise<void> {
  const columns = db.pragma('table_info(features)') as { name: string }[];
  const names = new Set(columns.map((c) => c.name));

  if (!names.has('queued_at')) {
    db.exec('ALTER TABLE features ADD COLUMN queued_at INTEGER');
  }

  db.exec(
    'CREATE INDEX IF NOT EXISTS idx_features_queued_at ON features(queued_at) WHERE queued_at IS NOT NULL'
  );
}

export async function down({ context: db }: MigrationParams<Database.Database>): Promise<void> {
  db.exec('DROP INDEX IF EXISTS idx_features_queued_at');
}
