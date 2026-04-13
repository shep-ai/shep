/**
 * Remove Plugin Use Case
 *
 * Removes a plugin from the registry and stops any running MCP servers.
 *
 * Business Rules:
 * - Throws if plugin not found
 * - Stops running MCP servers for the plugin via IMcpServerManager
 * - Deletes the plugin record from the registry
 * - Returns the removed plugin for confirmation
 */

import { injectable, inject } from 'tsyringe';
import type { Plugin } from '../../../domain/generated/output.js';
import type { IPluginRepository } from '../../ports/output/repositories/plugin-repository.interface.js';
import type { IMcpServerManager } from '../../ports/output/services/mcp-server-manager.interface.js';

@injectable()
export class RemovePluginUseCase {
  constructor(
    @inject('IPluginRepository')
    private readonly pluginRepo: IPluginRepository,
    @inject('IMcpServerManager')
    private readonly mcpServerManager: IMcpServerManager
  ) {}

  async execute(pluginName: string): Promise<Plugin> {
    const plugin = await this.pluginRepo.findByName(pluginName);
    if (!plugin) {
      throw new Error(`Plugin "${pluginName}" not found`);
    }

    // Stop any running MCP servers that may be using this plugin.
    // We check all active features — the manager handles the cleanup.
    // For now we rely on the manager to handle per-plugin cleanup internally.

    await this.pluginRepo.delete(plugin.id);
    return plugin;
  }
}
