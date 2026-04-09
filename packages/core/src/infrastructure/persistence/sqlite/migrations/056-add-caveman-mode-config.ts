/**
 * Migration 056: Add caveman mode configuration columns to settings.
 *
 * Caveman mode appends a terse-style directive to Claude Code's system
 * prompt via the `--append-system-prompt` CLI flag. It is disabled by
 * default because it changes the agent's output style globally; users
 * opt in explicitly.
 *
 * Settings table — caveman mode config:
 *  - caveman_mode_enabled (INTEGER NOT NULL DEFAULT 0) — master toggle, off by default
 *  - caveman_mode_directive (TEXT NULL) — optional custom directive; null = use factory default
 *
 * All columns are additive-only. No drops, no renames.
 * Guards against duplicate column errors using the table_info pragma
 * so a re-run against a database that already has the columns is a no-op.
 */

import type { MigrationParams } from 'umzug';
import type Database from 'better-sqlite3';

export async function up({ context: db }: MigrationParams<Database.Database>): Promise<void> {
  const settingsCols = db.pragma('table_info(settings)') as { name: string }[];
  const settingsNames = new Set(settingsCols.map((c) => c.name));

  if (!settingsNames.has('caveman_mode_enabled')) {
    db.exec('ALTER TABLE settings ADD COLUMN caveman_mode_enabled INTEGER NOT NULL DEFAULT 0');
  }
  if (!settingsNames.has('caveman_mode_directive')) {
    db.exec('ALTER TABLE settings ADD COLUMN caveman_mode_directive TEXT');
  }
}

export async function down({ context: db }: MigrationParams<Database.Database>): Promise<void> {
  void db;
}
