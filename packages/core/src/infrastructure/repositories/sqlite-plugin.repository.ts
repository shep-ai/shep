/**
 * SQLite Plugin Repository Implementation
 *
 * Implements IPluginRepository using SQLite database.
 * Uses prepared statements to prevent SQL injection.
 */

import type Database from 'better-sqlite3';
import { injectable } from 'tsyringe';
import type { IPluginRepository } from '../../application/ports/output/repositories/plugin-repository.interface.js';
import type { Plugin } from '../../domain/generated/output.js';
import {
  toDatabase,
  fromDatabase,
  type PluginRow,
} from '../persistence/sqlite/mappers/plugin.mapper.js';

/**
 * SQLite implementation of IPluginRepository.
 * Manages Plugin persistence with CRUD operations.
 */
@injectable()
export class SQLitePluginRepository implements IPluginRepository {
  constructor(private readonly db: Database.Database) {}

  async create(plugin: Plugin): Promise<void> {
    const row = toDatabase(plugin);

    const stmt = this.db.prepare(`
      INSERT INTO plugins (
        id, name, display_name, type,
        version, install_source,
        transport, server_command, server_args,
        required_env_vars, tool_groups, active_tool_groups,
        enabled, health_status, health_message,
        hook_type, script_path, binary_command,
        runtime_type, runtime_min_version,
        homepage_url, description,
        created_at, updated_at
      ) VALUES (
        @id, @name, @display_name, @type,
        @version, @install_source,
        @transport, @server_command, @server_args,
        @required_env_vars, @tool_groups, @active_tool_groups,
        @enabled, @health_status, @health_message,
        @hook_type, @script_path, @binary_command,
        @runtime_type, @runtime_min_version,
        @homepage_url, @description,
        @created_at, @updated_at
      )
    `);

    stmt.run(row);
  }

  async findById(id: string): Promise<Plugin | null> {
    const stmt = this.db.prepare('SELECT * FROM plugins WHERE id = ?');
    const row = stmt.get(id) as PluginRow | undefined;

    if (!row) {
      return null;
    }

    return fromDatabase(row);
  }

  async findByName(name: string): Promise<Plugin | null> {
    const stmt = this.db.prepare('SELECT * FROM plugins WHERE name = ?');
    const row = stmt.get(name) as PluginRow | undefined;

    if (!row) {
      return null;
    }

    return fromDatabase(row);
  }

  async list(): Promise<Plugin[]> {
    const stmt = this.db.prepare('SELECT * FROM plugins ORDER BY name ASC');
    const rows = stmt.all() as PluginRow[];

    return rows.map(fromDatabase);
  }

  async update(plugin: Plugin): Promise<void> {
    const row = toDatabase(plugin);

    const stmt = this.db.prepare(`
      UPDATE plugins SET
        name = @name,
        display_name = @display_name,
        type = @type,
        version = @version,
        install_source = @install_source,
        transport = @transport,
        server_command = @server_command,
        server_args = @server_args,
        required_env_vars = @required_env_vars,
        tool_groups = @tool_groups,
        active_tool_groups = @active_tool_groups,
        enabled = @enabled,
        health_status = @health_status,
        health_message = @health_message,
        hook_type = @hook_type,
        script_path = @script_path,
        binary_command = @binary_command,
        runtime_type = @runtime_type,
        runtime_min_version = @runtime_min_version,
        homepage_url = @homepage_url,
        description = @description,
        updated_at = @updated_at
      WHERE id = @id
    `);

    stmt.run(row);
  }

  async delete(id: string): Promise<void> {
    const stmt = this.db.prepare('DELETE FROM plugins WHERE id = ?');
    stmt.run(id);
  }
}
