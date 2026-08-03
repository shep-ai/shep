/**
 * Migration 140: Add adopted-session provenance columns to the features table.
 *
 * Records which agent CLI conversation a feature was adopted from (spec 105
 * import-codebases-adopt-sessions), so an adopted feature stays traceable back
 * to the transcript its metadata was derived from.
 *
 * - source_agent_session_id: provider-native session id (JSONL filename stem)
 * - source_agent_type: the AgentType that owned the session, since session ids
 *   are only unique within a provider and resuming needs the right binary
 *
 * Both columns are nullable — features created through the normal flow have no
 * originating session, so no backfill is required.
 */

import type { MigrationParams } from 'umzug';
import type Database from 'better-sqlite3';

export async function up({ context: db }: MigrationParams<Database.Database>): Promise<void> {
  const columns = db.pragma('table_info(features)') as { name: string }[];
  const names = new Set(columns.map((c) => c.name));

  if (!names.has('source_agent_session_id')) {
    db.exec('ALTER TABLE features ADD COLUMN source_agent_session_id TEXT');
  }

  if (!names.has('source_agent_type')) {
    db.exec('ALTER TABLE features ADD COLUMN source_agent_type TEXT');
  }
}

export async function down({ context: db }: MigrationParams<Database.Database>): Promise<void> {
  void db;
}
