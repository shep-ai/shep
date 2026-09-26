/**
 * Migration 147: Add reasoning-effort columns.
 *
 * - settings.model_effort (TEXT, nullable) — `settings.models.effort`, the
 *   default effort for new feature runs.
 * - agent_runs.effort (TEXT, nullable) — `AgentRun.effort`, the effort pinned
 *   on a run at creation and re-sent on every resume.
 *
 * NULL means "the agent's own default": no effort flag is passed to the agent
 * CLI. Every existing row gets NULL, so this migration changes no behaviour on
 * its own. Values are validated on read (`parseAgentEffort`), so the columns
 * carry no CHECK constraint that a future effort level would have to migrate.
 *
 * Additive only and guarded by PRAGMA so re-running is a no-op.
 */

import type { MigrationParams } from 'umzug';
import type Database from 'better-sqlite3';

function columnNames(db: Database.Database, table: string): Set<string> {
  const columns = db.pragma(`table_info(${table})`) as { name: string }[];
  return new Set(columns.map((c) => c.name));
}

export async function up({ context: db }: MigrationParams<Database.Database>): Promise<void> {
  if (!columnNames(db, 'settings').has('model_effort')) {
    db.exec('ALTER TABLE settings ADD COLUMN model_effort TEXT');
  }
  if (!columnNames(db, 'agent_runs').has('effort')) {
    db.exec('ALTER TABLE agent_runs ADD COLUMN effort TEXT');
  }
}

export async function down({ context: db }: MigrationParams<Database.Database>): Promise<void> {
  void db;
}
