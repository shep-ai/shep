/**
 * Configure Plugin Use Case
 *
 * Updates mutable plugin configuration such as active tool groups.
 *
 * Business Rules:
 * - Throws if plugin not found
 * - Validates that each active tool group exists in the plugin's available groups
 * - Throws on invalid group name with actionable message
 * - Returns the updated plugin
 */

import { injectable, inject } from 'tsyringe';
import type { Plugin } from '../../../domain/generated/output.js';
import type { IPluginRepository } from '../../ports/output/repositories/plugin-repository.interface.js';

export interface ConfigurePluginInput {
  activeToolGroups?: string[];
}

@injectable()
export class ConfigurePluginUseCase {
  constructor(
    @inject('IPluginRepository')
    private readonly pluginRepo: IPluginRepository
  ) {}

  async execute(pluginName: string, config: ConfigurePluginInput): Promise<Plugin> {
    const plugin = await this.pluginRepo.findByName(pluginName);
    if (!plugin) {
      throw new Error(`Plugin "${pluginName}" not found`);
    }

    if (config.activeToolGroups !== undefined) {
      const availableGroupNames = (plugin.toolGroups ?? []).map((g) => g.name);

      for (const groupName of config.activeToolGroups) {
        if (!availableGroupNames.includes(groupName)) {
          throw new Error(
            `Invalid tool group "${groupName}" for plugin "${pluginName}". Available groups: ${availableGroupNames.join(', ') || 'none'}`
          );
        }
      }
    }

    const updated: Plugin = {
      ...plugin,
      ...(config.activeToolGroups !== undefined && {
        activeToolGroups: config.activeToolGroups,
      }),
      updatedAt: new Date(),
    };

    await this.pluginRepo.update(updated);
    return updated;
  }
}
