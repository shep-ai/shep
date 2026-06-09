/**
 * Add Plugin Use Case
 *
 * Handles both catalog-based and custom plugin installation.
 * For catalog plugins, looks up metadata from the curated catalog.
 * For custom plugins, accepts explicit configuration.
 *
 * Business Rules:
 * - Throws if plugin name already exists in registry
 * - Catalog plugins get pre-configured metadata
 * - Custom plugins require type, and command for MCP plugins
 * - Creates Plugin entity and persists via repository
 */

import { injectable, inject } from 'tsyringe';
import { randomUUID } from 'node:crypto';
import type { Plugin } from '../../../domain/generated/output.js';
import {
  PluginType,
  PluginTransport,
  PluginHealthStatus,
} from '../../../domain/generated/output.js';
import type { IPluginRepository } from '../../ports/output/repositories/plugin-repository.interface.js';
import type { IPluginCatalog } from '../../ports/output/services/plugin-catalog.interface.js';

export interface AddCustomPluginInput {
  name: string;
  displayName?: string;
  type: PluginType;
  transport?: PluginTransport;
  serverCommand?: string;
  serverArgs?: string[];
  requiredEnvVars?: string[];
  runtimeType?: string;
  runtimeMinVersion?: string;
  homepageUrl?: string;
  description?: string;
}

@injectable()
export class AddPluginUseCase {
  constructor(
    @inject('IPluginRepository')
    private readonly pluginRepo: IPluginRepository,
    @inject('IPluginCatalog')
    private readonly catalog: IPluginCatalog
  ) {}

  async execute(input: string | AddCustomPluginInput): Promise<Plugin> {
    const name = typeof input === 'string' ? input : input.name;

    // Check for duplicates
    const existing = await this.pluginRepo.findByName(name);
    if (existing) {
      throw new Error(`Plugin "${name}" is already installed`);
    }

    const now = new Date();
    let plugin: Plugin;

    if (typeof input === 'string') {
      // Catalog-based install
      const catalogEntry = this.catalog.getEntry(input);
      if (!catalogEntry) {
        throw new Error(
          `Plugin "${input}" not found in catalog. Use custom install with explicit configuration.`
        );
      }

      plugin = {
        id: randomUUID(),
        name: catalogEntry.name,
        displayName: catalogEntry.displayName,
        type: catalogEntry.type,
        installSource: 'catalog',
        enabled: true,
        healthStatus: PluginHealthStatus.Unknown,
        createdAt: now,
        updatedAt: now,
        ...(catalogEntry.transport && { transport: catalogEntry.transport }),
        ...(catalogEntry.serverCommand && { serverCommand: catalogEntry.serverCommand }),
        ...(catalogEntry.serverArgs?.length && { serverArgs: catalogEntry.serverArgs }),
        ...(catalogEntry.requiredEnvVars?.length && {
          requiredEnvVars: catalogEntry.requiredEnvVars,
        }),
        ...(catalogEntry.toolGroups?.length && { toolGroups: catalogEntry.toolGroups }),
        ...(catalogEntry.runtimeType && { runtimeType: catalogEntry.runtimeType }),
        ...(catalogEntry.runtimeMinVersion && {
          runtimeMinVersion: catalogEntry.runtimeMinVersion,
        }),
        ...(catalogEntry.homepageUrl && { homepageUrl: catalogEntry.homepageUrl }),
        ...(catalogEntry.description && { description: catalogEntry.description }),
      };
    } else {
      // Custom plugin install
      plugin = {
        id: randomUUID(),
        name: input.name,
        displayName: input.displayName ?? input.name,
        type: input.type,
        installSource: 'custom',
        enabled: true,
        healthStatus: PluginHealthStatus.Unknown,
        createdAt: now,
        updatedAt: now,
        ...(input.transport && { transport: input.transport }),
        ...(input.serverCommand && { serverCommand: input.serverCommand }),
        ...(input.serverArgs?.length && { serverArgs: input.serverArgs }),
        ...(input.requiredEnvVars?.length && { requiredEnvVars: input.requiredEnvVars }),
        ...(input.runtimeType && { runtimeType: input.runtimeType }),
        ...(input.runtimeMinVersion && { runtimeMinVersion: input.runtimeMinVersion }),
        ...(input.homepageUrl && { homepageUrl: input.homepageUrl }),
        ...(input.description && { description: input.description }),
      };
    }

    await this.pluginRepo.create(plugin);
    return plugin;
  }
}
