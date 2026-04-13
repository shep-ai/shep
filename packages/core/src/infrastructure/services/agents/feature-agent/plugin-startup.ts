/**
 * Plugin Startup Helpers
 *
 * Encapsulates MCP plugin server lifecycle for the feature agent worker.
 * Queries enabled MCP plugins, starts their servers, and generates
 * the per-feature MCP config path for the agent executor.
 */

import { PluginType } from '@/domain/generated/output.js';
import type { IPluginRepository } from '@/application/ports/output/repositories/plugin-repository.interface.js';
import type { IMcpServerManager } from '@/application/ports/output/services/mcp-server-manager.interface.js';

/**
 * Start MCP servers for all enabled MCP plugins and return the config path.
 *
 * Degrades gracefully: if any step fails, logs a warning and returns
 * undefined so the agent can proceed without plugin tools.
 *
 * @returns Absolute path to the generated MCP config file, or undefined
 */
export async function startPluginServers(
  featureId: string,
  pluginRepository: IPluginRepository,
  mcpServerManager: IMcpServerManager,
  log?: (message: string) => void
): Promise<string | undefined> {
  try {
    const allPlugins = await pluginRepository.list();
    const mcpPlugins = allPlugins.filter((p) => p.enabled && p.type === PluginType.Mcp);

    if (mcpPlugins.length === 0) {
      log?.('No enabled MCP plugins — skipping plugin server startup');
      return undefined;
    }

    log?.(
      `Starting MCP servers for ${mcpPlugins.length} plugin(s): ${mcpPlugins.map((p) => p.name).join(', ')}`
    );
    await mcpServerManager.startServersForFeature(featureId, mcpPlugins);

    const configPath = await mcpServerManager.generateMcpConfigPath(featureId);
    if (configPath) {
      log?.(`MCP config generated at ${configPath}`);
      return configPath;
    }

    log?.('MCP config generation returned null — no active servers');
    return undefined;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    log?.(`Plugin server startup failed (degrading gracefully): ${message}`);
    return undefined;
  }
}

/**
 * Stop MCP servers for a feature. Safe to call unconditionally in finally blocks.
 */
export async function stopPluginServers(
  featureId: string,
  mcpServerManager: IMcpServerManager,
  log?: (message: string) => void
): Promise<void> {
  try {
    await mcpServerManager.stopServersForFeature(featureId);
    log?.('Plugin MCP servers stopped');
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    log?.(`Plugin server cleanup failed (non-fatal): ${message}`);
  }
}
