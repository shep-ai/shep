/**
 * Migration 093: Add performance indexes for hot-path queries.
 *
 * The web UI's SSE poll runs `interactive_sessions.findByFeatureId(...)` once
 * per active feature every 2s. Without an index on `feature_id`, each call
 * is a full-table scan.
 *
 * `features(agent_run_id)` is used by joins from agent runs back to the
 * owning feature; partial index keeps the index small (most rows are NULL
 * for archived features that no longer have an active run).
 *
 * Both indexes use `IF NOT EXISTS` so the migration is idempotent.
 */

import type { MigrationParams } from 'umzug';
import type Database from 'better-sqlite3';

export async function up({ context: db }: MigrationParams<Database.Database>): Promise<void> {
  db.exec(
    'CREATE INDEX IF NOT EXISTS idx_interactive_sessions_feature_id ON interactive_sessions(feature_id)'
  );
  db.exec(
    'CREATE INDEX IF NOT EXISTS idx_features_agent_run_id ON features(agent_run_id) WHERE agent_run_id IS NOT NULL'
  );
}

export async function down({ context: db }: MigrationParams<Database.Database>): Promise<void> {
  db.exec('DROP INDEX IF EXISTS idx_interactive_sessions_feature_id');
  db.exec('DROP INDEX IF EXISTS idx_features_agent_run_id');
}
