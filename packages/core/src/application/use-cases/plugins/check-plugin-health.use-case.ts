/**
 * Check Plugin Health Use Case
 *
 * Runs health checks on a specific plugin or all plugins.
 * Updates health status in the repository after check.
 *
 * Business Rules:
 * - execute(name) checks a single plugin and updates its health status
 * - execute() with no args checks all plugins
 * - Returns health check results
 */

import { injectable, inject } from 'tsyringe';
import type { IPluginRepository } from '../../ports/output/repositories/plugin-repository.interface.js';
import type {
  IPluginHealthChecker,
  PluginHealthResult,
} from '../../ports/output/services/plugin-health-checker.interface.js';

@injectable()
export class CheckPluginHealthUseCase {
  constructor(
    @inject('IPluginRepository')
    private readonly pluginRepo: IPluginRepository,
    @inject('IPluginHealthChecker')
    private readonly healthChecker: IPluginHealthChecker
  ) {}

  async execute(pluginName?: string): Promise<PluginHealthResult[]> {
    if (pluginName) {
      const plugin = await this.pluginRepo.findByName(pluginName);
      if (!plugin) {
        throw new Error(`Plugin "${pluginName}" not found`);
      }

      const result = await this.healthChecker.checkHealth(plugin);

      // Update health status in repository
      await this.pluginRepo.update({
        ...plugin,
        healthStatus: result.status,
        healthMessage: result.message,
        updatedAt: new Date(),
      });

      return [result];
    }

    // Check all plugins
    const plugins = await this.pluginRepo.list();
    if (plugins.length === 0) {
      return [];
    }

    const results = await this.healthChecker.checkAllHealth(plugins);

    // Update all health statuses
    for (let i = 0; i < plugins.length; i++) {
      await this.pluginRepo.update({
        ...plugins[i],
        healthStatus: results[i].status,
        healthMessage: results[i].message,
        updatedAt: new Date(),
      });
    }

    return results;
  }
}
