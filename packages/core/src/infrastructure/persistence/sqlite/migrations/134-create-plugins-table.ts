/**
 * Migration 060: Create plugins table for the AI tool plugin system.
 *
 * Stores the plugin registry with metadata for three integration types:
 * MCP server plugins, hook-based plugins, and CLI tool plugins.
 * JSON columns (TEXT) are used for array fields: server_args, required_env_vars,
 * tool_groups, and active_tool_groups.
 */

import type { MigrationParams } from 'umzug';
import type Database from 'better-sqlite3';

export async function up({ context: db }: MigrationParams<Database.Database>): Promise<void> {
  const tables = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='plugins'")
    .all() as { name: string }[];

  if (tables.length === 0) {
    db.exec(`
      CREATE TABLE plugins (
        id                  TEXT PRIMARY KEY,
        name                TEXT NOT NULL,
        display_name        TEXT NOT NULL,
        type                TEXT NOT NULL,
        version             TEXT,
        install_source      TEXT,
        transport           TEXT,
        server_command      TEXT,
        server_args         TEXT,
        required_env_vars   TEXT,
        tool_groups         TEXT,
        active_tool_groups  TEXT,
        enabled             INTEGER NOT NULL DEFAULT 1,
        health_status       TEXT NOT NULL DEFAULT 'Unknown',
        health_message      TEXT,
        hook_type           TEXT,
        script_path         TEXT,
        binary_command      TEXT,
        runtime_type        TEXT,
        runtime_min_version TEXT,
        homepage_url        TEXT,
        description         TEXT,
        created_at          INTEGER NOT NULL,
        updated_at          INTEGER NOT NULL
      )
    `);
  }

  const indexes = db.pragma('index_list(plugins)') as { name: string }[];
  const indexNames = new Set(indexes.map((i) => i.name));

  if (!indexNames.has('idx_plugins_name')) {
    db.exec('CREATE UNIQUE INDEX idx_plugins_name ON plugins(name)');
  }
}

export async function down({ context: db }: MigrationParams<Database.Database>): Promise<void> {
  db.exec('DROP TABLE IF EXISTS plugins');
}
