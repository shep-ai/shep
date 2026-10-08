/**
 * Migration 166: the fleet admission-queue pause record (spec 111).
 *
 * `settings.workflow_queue_pause` holds the JSON `FleetQueuePause`
 * (`{ pausedAt, reason }`) while the admission queue is parked by the circuit
 * breaker or by `shep fleet pause`, and NULL while the queue is draining.
 *
 * Additive and idempotent. A NULL column means "not paused", which is also the
 * behaviour of every install that predates this migration — so no backfill is
 * needed and rolling back to an older build is harmless.
 */

import type { MigrationParams } from 'umzug';
import type Database from 'better-sqlite3';
import { addColumn } from '../add-column.js';

export async function up({ context: db }: MigrationParams<Database.Database>): Promise<void> {
  addColumn(db, 'settings', 'workflow_queue_pause', 'TEXT');
}

export async function down(_params: MigrationParams<Database.Database>): Promise<void> {
  // Additive migration: a nullable column is harmless to an older build.
}
