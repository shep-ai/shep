/**
 * Migration 057: Add subprocess output filter configuration to settings.
 *
 * Subprocess filtering intercepts Bash tool commands (git, npm, pnpm)
 * inside the Claude Code subprocess via PATH shadow and filters their
 * output before it enters conversation history. Disabled by default.
 *
 * Settings table:
 *  - subprocess_filter_enabled (INTEGER NOT NULL DEFAULT 0)
 *
 * Additive-only. No drops, no renames. Idempotent via table_info check.
 */

import type { MigrationParams } from 'umzug';
import type Database from 'better-sqlite3';

export async function up({ context: db }: MigrationParams<Database.Database>): Promise<void> {
  const cols = db.pragma('table_info(settings)') as { name: string }[];
  const names = new Set(cols.map((c) => c.name));

  if (!names.has('subprocess_filter_enabled')) {
    db.exec('ALTER TABLE settings ADD COLUMN subprocess_filter_enabled INTEGER NOT NULL DEFAULT 0');
  }
}

export async function down({ context: db }: MigrationParams<Database.Database>): Promise<void> {
  void db;
}
