/**
 * Migration 153: Space agent settings (spec 121).
 *
 * Nullable columns on spaces for the space's agent credentials, identity and
 * allowed agents. NULL means "inherit the host", so existing spaces keep their
 * behaviour. use_bedrock is tri-state (1, 0, NULL); allowed_agent_types is a
 * JSON array of AgentType values.
 *
 * Additive and guarded so re-running is a no-op.
 */

import type { MigrationParams } from 'umzug';
import type Database from 'better-sqlite3';

const COLUMNS: readonly [name: string, type: string][] = [
  ['claude_config_dir', 'TEXT'],
  ['gh_config_dir', 'TEXT'],
  ['git_author_name', 'TEXT'],
  ['git_author_email', 'TEXT'],
  ['aws_profile', 'TEXT'],
  ['use_bedrock', 'INTEGER'],
  ['allowed_agent_types', 'TEXT'],
];

export async function up({ context: db }: MigrationParams<Database.Database>): Promise<void> {
  const existing = new Set(
    (db.pragma('table_info(spaces)') as { name: string }[]).map((column) => column.name)
  );
  for (const [name, type] of COLUMNS) {
    if (!existing.has(name)) db.exec(`ALTER TABLE spaces ADD COLUMN ${name} ${type}`);
  }
}

export async function down(_params: MigrationParams<Database.Database>): Promise<void> {
  // Additive migration: nullable columns are harmless to an older build.
}
