/**
 * Plugin Health Checker Interface
 *
 * Output port for verifying plugin operational health.
 * Implements multi-tier health checks: runtime detection,
 * package verification, env var validation, and optional server probe.
 *
 * Following Clean Architecture:
 * - Application layer depends on this interface
 * - Infrastructure layer provides concrete implementation
 */

import type { Plugin, PluginHealthStatus } from '../../../../domain/generated/output.js';

/**
 * Result of a health check on a single plugin.
 */
export interface PluginHealthResult {
  /** The plugin name that was checked */
  pluginName: string;
  /** Overall health status */
  status: PluginHealthStatus;
  /** Human-readable details about the health check result */
  message: string;
}

/**
 * Service interface for plugin health verification.
 *
 * Implementations must:
 * - Check runtime availability (python3/node on PATH)
 * - Verify package installation where applicable
 * - Validate required environment variables are set
 * - Optionally probe MCP server startup for deep checks
 */
export interface IPluginHealthChecker {
  /**
   * Run a multi-tier health check on a single plugin.
   *
   * @param plugin - The plugin to check
   * @returns Health check result with status and message
   */
  checkHealth(plugin: Plugin): Promise<PluginHealthResult>;

  /**
   * Run health checks on all provided plugins.
   *
   * @param plugins - Plugins to check
   * @returns Array of health results, one per plugin
   */
  checkAllHealth(plugins: Plugin[]): Promise<PluginHealthResult[]>;
}
