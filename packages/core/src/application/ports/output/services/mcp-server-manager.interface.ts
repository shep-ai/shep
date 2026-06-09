/**
 * MCP Server Manager Interface
 *
 * Output port for managing MCP server process lifecycle.
 * Handles spawning, stopping, and reference counting of MCP server
 * processes used by plugins during feature execution.
 *
 * Following Clean Architecture:
 * - Application layer depends on this interface
 * - Infrastructure layer provides concrete implementation (child_process.spawn)
 */

import type { Plugin } from '../../../../domain/generated/output.js';

/**
 * Information about a running MCP server process.
 */
export interface ActiveMcpServer {
  /** Plugin name this server belongs to */
  pluginName: string;
  /** Process ID of the running server */
  pid: number;
  /** Number of features currently using this server */
  referenceCount: number;
}

/**
 * Service interface for managing MCP server process lifecycle.
 *
 * Implementations must:
 * - Spawn MCP server processes for enabled plugins
 * - Track reference counts for concurrent feature access
 * - Clean up processes on feature stop or unexpected exit
 * - Generate per-feature MCP config files for agent executors
 */
export interface IMcpServerManager {
  /**
   * Start MCP servers for all provided plugins for a given feature.
   * Increments reference counts for already-running shared servers.
   *
   * @param featureId - The feature requesting the servers
   * @param plugins - MCP-type plugins to start servers for
   */
  startServersForFeature(featureId: string, plugins: Plugin[]): Promise<void>;

  /**
   * Stop MCP servers for a feature and decrement reference counts.
   * Kills server processes when reference count reaches zero.
   * Also cleans up the per-feature MCP config temp file.
   *
   * @param featureId - The feature releasing the servers
   */
  stopServersForFeature(featureId: string): Promise<void>;

  /**
   * Get information about all MCP servers active for a feature.
   *
   * @param featureId - The feature to query
   * @returns Array of active server info, empty if none
   */
  getActiveServers(featureId: string): ActiveMcpServer[];

  /**
   * Generate a temporary .mcp.json config file for a feature's active plugins.
   * The file path can be passed to agent executors via --mcp-config flag.
   *
   * @param featureId - The feature to generate config for
   * @returns Absolute path to the generated temp config file, or null if no active servers
   */
  generateMcpConfigPath(featureId: string): Promise<string | null>;
}
