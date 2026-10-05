/**
 * Autopilot (spec 132): the policy and pass repositories, the autopilot and
 * factory status use cases, plus string-token aliases for web server actions
 * and the daemon.
 */

import type { DependencyContainer } from 'tsyringe';
import type Database from 'better-sqlite3';

import type {
  IAutopilotPolicyRepository,
  IAutopilotRunRepository,
} from '../../../application/ports/output/repositories/autopilot-repository.interface.js';
import {
  SQLiteAutopilotPolicyRepository,
  SQLiteAutopilotRunRepository,
} from '../../repositories/sqlite-autopilot.repository.js';
import { ListUrgentWorkItemsUseCase } from '../../../application/use-cases/autopilot/list-urgent-work-items.use-case.js';
import { ManageAutopilotUseCase } from '../../../application/use-cases/autopilot/manage-autopilot.use-case.js';
import { RunAutopilotUseCase } from '../../../application/use-cases/autopilot/run-autopilot.use-case.js';
import { GetFactoryStatusUseCase } from '../../../application/use-cases/autopilot/get-factory-status.use-case.js';

export function registerAutopilot(container: DependencyContainer): void {
  container.register<IAutopilotPolicyRepository>('IAutopilotPolicyRepository', {
    useFactory: (c) =>
      new SQLiteAutopilotPolicyRepository(c.resolve<Database.Database>('Database')),
  });
  container.register<IAutopilotRunRepository>('IAutopilotRunRepository', {
    useFactory: (c) => new SQLiteAutopilotRunRepository(c.resolve<Database.Database>('Database')),
  });

  container.registerSingleton(ListUrgentWorkItemsUseCase);
  container.registerSingleton(ManageAutopilotUseCase);
  container.registerSingleton(RunAutopilotUseCase);
  container.registerSingleton(GetFactoryStatusUseCase);

  container.register('ManageAutopilotUseCase', {
    useFactory: (c) => c.resolve(ManageAutopilotUseCase),
  });
  container.register('RunAutopilotUseCase', {
    useFactory: (c) => c.resolve(RunAutopilotUseCase),
  });
  container.register('GetFactoryStatusUseCase', {
    useFactory: (c) => c.resolve(GetFactoryStatusUseCase),
  });
}
