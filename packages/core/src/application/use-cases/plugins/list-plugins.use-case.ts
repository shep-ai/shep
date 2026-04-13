/**
 * List Plugins Use Case
 *
 * Retrieves all registered plugins with optional filtering.
 *
 * Business Rules:
 * - Returns all plugins when no filters provided
 * - Supports filtering by enabled status
 * - Supports filtering by plugin type
 */

import { injectable, inject } from 'tsyringe';
import type { Plugin, PluginType } from '../../../domain/generated/output.js';
import type { IPluginRepository } from '../../ports/output/repositories/plugin-repository.interface.js';

export interface ListPluginsFilters {
  enabled?: boolean;
  type?: PluginType;
}

@injectable()
export class ListPluginsUseCase {
  constructor(
    @inject('IPluginRepository')
    private readonly pluginRepo: IPluginRepository
  ) {}

  async execute(filters?: ListPluginsFilters): Promise<Plugin[]> {
    const plugins = await this.pluginRepo.list();

    if (!filters) {
      return plugins;
    }

    return plugins.filter((plugin) => {
      if (filters.enabled !== undefined && plugin.enabled !== filters.enabled) {
        return false;
      }
      if (filters.type !== undefined && plugin.type !== filters.type) {
        return false;
      }
      return true;
    });
  }
}
