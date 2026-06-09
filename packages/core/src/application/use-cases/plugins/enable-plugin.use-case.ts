/**
 * Enable Plugin Use Case
 *
 * Sets a plugin's global enabled state to true.
 *
 * Business Rules:
 * - Throws if plugin not found
 * - Updates enabled flag and persists
 * - Returns the updated plugin
 */

import { injectable, inject } from 'tsyringe';
import type { Plugin } from '../../../domain/generated/output.js';
import type { IPluginRepository } from '../../ports/output/repositories/plugin-repository.interface.js';

@injectable()
export class EnablePluginUseCase {
  constructor(
    @inject('IPluginRepository')
    private readonly pluginRepo: IPluginRepository
  ) {}

  async execute(pluginName: string): Promise<Plugin> {
    const plugin = await this.pluginRepo.findByName(pluginName);
    if (!plugin) {
      throw new Error(`Plugin "${pluginName}" not found`);
    }

    const updated: Plugin = {
      ...plugin,
      enabled: true,
      updatedAt: new Date(),
    };

    await this.pluginRepo.update(updated);
    return updated;
  }
}
