/**
 * Get Plugin Catalog Use Case
 *
 * Returns curated catalog entries with installation status
 * cross-referenced against the plugin registry.
 *
 * Business Rules:
 * - Returns all catalog entries
 * - Each entry includes isInstalled flag from registry lookup
 */

import { injectable, inject } from 'tsyringe';
import type { IPluginRepository } from '../../ports/output/repositories/plugin-repository.interface.js';
import type { CatalogEntry } from '../../../infrastructure/services/plugin/plugin-catalog.js';
import { getCatalogEntries } from '../../../infrastructure/services/plugin/plugin-catalog.js';

export interface CatalogEntryWithStatus extends CatalogEntry {
  isInstalled: boolean;
}

@injectable()
export class GetPluginCatalogUseCase {
  constructor(
    @inject('IPluginRepository')
    private readonly pluginRepo: IPluginRepository
  ) {}

  async execute(): Promise<CatalogEntryWithStatus[]> {
    const catalog = getCatalogEntries();
    const installedPlugins = await this.pluginRepo.list();
    const installedNames = new Set(installedPlugins.map((p) => p.name));

    return catalog.map((entry) => ({
      ...entry,
      isInstalled: installedNames.has(entry.name),
    }));
  }
}
