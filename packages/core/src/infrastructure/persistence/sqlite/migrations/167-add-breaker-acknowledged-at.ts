/**
 * Migration 167: the circuit-breaker acknowledgement timestamp (spec 111).
 *
 * `settings.workflow_breaker_acknowledged_at` records when the user last
 * acknowledged a breaker trip (ISO 8601 TEXT), or NULL when they never have.
 *
 * The breaker's metrics read a rolling window of `agent_runs`, which cannot
 * record that a human has already looked at the failures. Without this column,
 * `shep fleet resume` is undone by the very next status read while the same
 * failing runs are still inside the 15-minute window — and on the web that read
 * happens on every dashboard render and every SSE agent event.
 *
 * Additive and idempotent. NULL means "never acknowledged", which is the
 * behaviour of every install that predates this migration — those breakers keep
 * tripping on the whole window, exactly as they did before.
 */

import type { MigrationParams } from 'umzug';
import type Database from 'better-sqlite3';
import { addColumn } from '../add-column.js';

export async function up({ context: db }: MigrationParams<Database.Database>): Promise<void> {
  addColumn(db, 'settings', 'workflow_breaker_acknowledged_at', 'TEXT');
}

export async function down(_params: MigrationParams<Database.Database>): Promise<void> {
  // Additive migration: a nullable column is harmless to an older build.
}
