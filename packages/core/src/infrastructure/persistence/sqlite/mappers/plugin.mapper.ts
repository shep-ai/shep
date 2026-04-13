/**
 * Plugin Database Mapper
 *
 * Maps between Plugin domain objects and SQLite database rows.
 *
 * Mapping Rules:
 * - TypeScript objects (camelCase) <-> SQL columns (snake_case)
 * - Dates stored as INTEGER (unix milliseconds)
 * - Optional fields stored as NULL when missing
 * - Array fields (serverArgs, requiredEnvVars, toolGroups, activeToolGroups) stored as JSON TEXT
 * - Boolean enabled field stored as INTEGER (0/1)
 * - Enum fields (type, transport, healthStatus) stored as TEXT strings
 */

import type { Plugin, ToolGroup } from '../../../../domain/generated/output.js';
import type {
  PluginType,
  PluginTransport,
  PluginHealthStatus,
} from '../../../../domain/generated/output.js';

/**
 * Database row type matching the plugins table schema.
 * Uses snake_case column names.
 */
export interface PluginRow {
  id: string;
  name: string;
  display_name: string;
  type: string;
  version: string | null;
  install_source: string | null;
  transport: string | null;
  server_command: string | null;
  server_args: string | null;
  required_env_vars: string | null;
  tool_groups: string | null;
  active_tool_groups: string | null;
  enabled: number;
  health_status: string;
  health_message: string | null;
  hook_type: string | null;
  script_path: string | null;
  binary_command: string | null;
  runtime_type: string | null;
  runtime_min_version: string | null;
  homepage_url: string | null;
  description: string | null;
  created_at: number;
  updated_at: number;
}

/**
 * Maps Plugin domain object to database row.
 * Converts Date objects to unix milliseconds and array fields to JSON for SQL storage.
 *
 * @param plugin - Plugin domain object
 * @returns Database row object with snake_case columns
 */
export function toDatabase(plugin: Plugin): PluginRow {
  return {
    id: plugin.id,
    name: plugin.name,
    display_name: plugin.displayName,
    type: plugin.type,
    version: plugin.version ?? null,
    install_source: plugin.installSource ?? null,
    transport: plugin.transport ?? null,
    server_command: plugin.serverCommand ?? null,
    server_args: plugin.serverArgs?.length ? JSON.stringify(plugin.serverArgs) : null,
    required_env_vars: plugin.requiredEnvVars?.length
      ? JSON.stringify(plugin.requiredEnvVars)
      : null,
    tool_groups: plugin.toolGroups?.length ? JSON.stringify(plugin.toolGroups) : null,
    active_tool_groups: plugin.activeToolGroups?.length
      ? JSON.stringify(plugin.activeToolGroups)
      : null,
    enabled: plugin.enabled ? 1 : 0,
    health_status: plugin.healthStatus,
    health_message: plugin.healthMessage ?? null,
    hook_type: plugin.hookType ?? null,
    script_path: plugin.scriptPath ?? null,
    binary_command: plugin.binaryCommand ?? null,
    runtime_type: plugin.runtimeType ?? null,
    runtime_min_version: plugin.runtimeMinVersion ?? null,
    homepage_url: plugin.homepageUrl ?? null,
    description: plugin.description ?? null,
    created_at: plugin.createdAt instanceof Date ? plugin.createdAt.getTime() : plugin.createdAt,
    updated_at: plugin.updatedAt instanceof Date ? plugin.updatedAt.getTime() : plugin.updatedAt,
  };
}

/**
 * Maps database row to Plugin domain object.
 * Converts unix milliseconds back to Date objects and JSON strings to arrays/objects.
 *
 * @param row - Database row with snake_case columns
 * @returns Plugin domain object with camelCase properties
 */
export function fromDatabase(row: PluginRow): Plugin {
  return {
    id: row.id,
    name: row.name,
    displayName: row.display_name,
    type: row.type as PluginType,
    enabled: row.enabled === 1,
    healthStatus: row.health_status as PluginHealthStatus,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
    ...(row.version != null && { version: row.version }),
    ...(row.install_source != null && { installSource: row.install_source }),
    ...(row.transport != null && { transport: row.transport as PluginTransport }),
    ...(row.server_command != null && { serverCommand: row.server_command }),
    ...(row.server_args != null && { serverArgs: JSON.parse(row.server_args) as string[] }),
    ...(row.required_env_vars != null && {
      requiredEnvVars: JSON.parse(row.required_env_vars) as string[],
    }),
    ...(row.tool_groups != null && { toolGroups: JSON.parse(row.tool_groups) as ToolGroup[] }),
    ...(row.active_tool_groups != null && {
      activeToolGroups: JSON.parse(row.active_tool_groups) as string[],
    }),
    ...(row.health_message != null && { healthMessage: row.health_message }),
    ...(row.hook_type != null && { hookType: row.hook_type }),
    ...(row.script_path != null && { scriptPath: row.script_path }),
    ...(row.binary_command != null && { binaryCommand: row.binary_command }),
    ...(row.runtime_type != null && { runtimeType: row.runtime_type }),
    ...(row.runtime_min_version != null && { runtimeMinVersion: row.runtime_min_version }),
    ...(row.homepage_url != null && { homepageUrl: row.homepage_url }),
    ...(row.description != null && { description: row.description }),
  };
}
