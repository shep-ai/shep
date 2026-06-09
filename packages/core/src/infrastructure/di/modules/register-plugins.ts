import { spawn } from 'node:child_process';
import type { DependencyContainer } from 'tsyringe';
import type Database from 'better-sqlite3';

import type { IPluginRepository } from '../../../application/ports/output/repositories/plugin-repository.interface.js';
import { SQLitePluginRepository } from '../../repositories/sqlite-plugin.repository.js';
import type { IPluginHealthChecker } from '../../../application/ports/output/services/plugin-health-checker.interface.js';
import { PluginHealthCheckerService } from '../../services/plugin/plugin-health-checker.service.js';
import type { IMcpServerManager } from '../../../application/ports/output/services/mcp-server-manager.interface.js';
import { McpServerManagerService } from '../../services/plugin/mcp-server-manager.service.js';
import type { IPluginCatalog } from '../../../application/ports/output/services/plugin-catalog.interface.js';
import { getCatalogEntries, getCatalogEntry } from '../../services/plugin/plugin-catalog.js';

import { AddPluginUseCase } from '../../../application/use-cases/plugins/add-plugin.use-case.js';
import { RemovePluginUseCase } from '../../../application/use-cases/plugins/remove-plugin.use-case.js';
import { ListPluginsUseCase } from '../../../application/use-cases/plugins/list-plugins.use-case.js';
import { EnablePluginUseCase } from '../../../application/use-cases/plugins/enable-plugin.use-case.js';
import { DisablePluginUseCase } from '../../../application/use-cases/plugins/disable-plugin.use-case.js';
import { ConfigurePluginUseCase } from '../../../application/use-cases/plugins/configure-plugin.use-case.js';
import { CheckPluginHealthUseCase } from '../../../application/use-cases/plugins/check-plugin-health.use-case.js';
import { GetPluginCatalogUseCase } from '../../../application/use-cases/plugins/get-plugin-catalog.use-case.js';

export function registerPlugins(container: DependencyContainer): void {
  // ─── Plugin catalog (static data adapter) ────────────────────────────────
  const pluginCatalog: IPluginCatalog = {
    getEntries: getCatalogEntries,
    getEntry: getCatalogEntry,
  };
  container.register<IPluginCatalog>('IPluginCatalog', { useValue: pluginCatalog });

  // ─── Plugin repository ───────────────────────────────────────────────────
  container.register<IPluginRepository>('IPluginRepository', {
    useFactory: (c) => {
      const database = c.resolve<Database.Database>('Database');
      return new SQLitePluginRepository(database);
    },
  });

  // ─── Plugin services ─────────────────────────────────────────────────────
  container.registerSingleton<IPluginHealthChecker>(
    'IPluginHealthChecker',
    PluginHealthCheckerService
  );

  // SpawnFunction token for McpServerManagerService (uses child_process.spawn)
  container.register('SpawnFunction', { useValue: spawn });
  container.registerSingleton<IMcpServerManager>('IMcpServerManager', McpServerManagerService);

  // ─── Plugin use cases (class-token singletons) ───────────────────────────
  container.registerSingleton(AddPluginUseCase);
  container.registerSingleton(RemovePluginUseCase);
  container.registerSingleton(ListPluginsUseCase);
  container.registerSingleton(EnablePluginUseCase);
  container.registerSingleton(DisablePluginUseCase);
  container.registerSingleton(ConfigurePluginUseCase);
  container.registerSingleton(CheckPluginHealthUseCase);
  container.registerSingleton(GetPluginCatalogUseCase);

  // ─── Plugin use case string-token aliases (for web server actions) ────────
  container.register('AddPluginUseCase', {
    useFactory: (c) => c.resolve(AddPluginUseCase),
  });
  container.register('RemovePluginUseCase', {
    useFactory: (c) => c.resolve(RemovePluginUseCase),
  });
  container.register('ListPluginsUseCase', {
    useFactory: (c) => c.resolve(ListPluginsUseCase),
  });
  container.register('EnablePluginUseCase', {
    useFactory: (c) => c.resolve(EnablePluginUseCase),
  });
  container.register('DisablePluginUseCase', {
    useFactory: (c) => c.resolve(DisablePluginUseCase),
  });
  container.register('ConfigurePluginUseCase', {
    useFactory: (c) => c.resolve(ConfigurePluginUseCase),
  });
  container.register('CheckPluginHealthUseCase', {
    useFactory: (c) => c.resolve(CheckPluginHealthUseCase),
  });
  container.register('GetPluginCatalogUseCase', {
    useFactory: (c) => c.resolve(GetPluginCatalogUseCase),
  });
}
