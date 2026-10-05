/**
 * Discovery (spec 128): the run repository and use cases, plus string-token
 * aliases for web server actions and the daemon.
 */

import type { DependencyContainer } from 'tsyringe';
import type Database from 'better-sqlite3';

import type { IDiscoveryRunRepository } from '../../../application/ports/output/repositories/discovery-run-repository.interface.js';
import { SQLiteDiscoveryRunRepository } from '../../repositories/sqlite-discovery-run.repository.js';
import { RunDiscoveryUseCase } from '../../../application/use-cases/discovery/run-discovery.use-case.js';
import { SyncDiscoveryUseCase } from '../../../application/use-cases/discovery/sync-discovery.use-case.js';
import { ListDiscoveryRunsUseCase } from '../../../application/use-cases/discovery/list-discovery-runs.use-case.js';

export function registerDiscovery(container: DependencyContainer): void {
  container.register<IDiscoveryRunRepository>('IDiscoveryRunRepository', {
    useFactory: (c) => new SQLiteDiscoveryRunRepository(c.resolve<Database.Database>('Database')),
  });

  container.registerSingleton(RunDiscoveryUseCase);
  container.registerSingleton(SyncDiscoveryUseCase);
  container.registerSingleton(ListDiscoveryRunsUseCase);

  container.register('RunDiscoveryUseCase', {
    useFactory: (c) => c.resolve(RunDiscoveryUseCase),
  });
  container.register('SyncDiscoveryUseCase', {
    useFactory: (c) => c.resolve(SyncDiscoveryUseCase),
  });
  container.register('ListDiscoveryRunsUseCase', {
    useFactory: (c) => c.resolve(ListDiscoveryRunsUseCase),
  });
}
