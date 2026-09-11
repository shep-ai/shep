/**
 * Migration 143: Add composite indexes backing the Fleet Control Plane (spec 111).
 *
 * `shep fleet status` and `shep fleet triage` derive every count at query time
 * from `features`, `agent_runs`, and `agent_questions` rather than maintaining
 * mutable counters, so the aggregate queries need covering indexes to stay in
 * the interactive (<50ms) budget on a 50+ feature fleet.
 *
 * Indexes:
 *  - `features(repository_path, lifecycle)` — the scoped fleet rollup. Partial
 *    on `deleted_at IS NULL` because soft-deleted features are never counted.
 *  - `agent_runs(status, completed_at)` — the circuit breaker rolling window
 *    (consecutive failures + rolling failure rate).
 *  - `agent_questions(status, kind)` — the open blocking-question count.
 *
 * Additive and guarded by `IF NOT EXISTS` so re-running is a no-op.
 */

import type { MigrationParams } from 'umzug';
import type Database from 'better-sqlite3';

export async function up({ context: db }: MigrationParams<Database.Database>): Promise<void> {
  db.exec(
    'CREATE INDEX IF NOT EXISTS idx_features_fleet_scope ON features(repository_path, lifecycle) WHERE deleted_at IS NULL'
  );
  db.exec(
    'CREATE INDEX IF NOT EXISTS idx_agent_runs_status_completed ON agent_runs(status, completed_at)'
  );
  db.exec(
    'CREATE INDEX IF NOT EXISTS idx_agent_questions_status_kind ON agent_questions(status, kind)'
  );
}

export async function down({ context: db }: MigrationParams<Database.Database>): Promise<void> {
  db.exec('DROP INDEX IF EXISTS idx_features_fleet_scope');
  db.exec('DROP INDEX IF EXISTS idx_agent_runs_status_completed');
  db.exec('DROP INDEX IF EXISTS idx_agent_questions_status_kind');
}
