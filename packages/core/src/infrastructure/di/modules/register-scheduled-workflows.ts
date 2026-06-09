/**
 * Scheduled Workflows DI Registration Module
 *
 * Registers all repositories, services, and use cases for the scheduled workflows feature.
 */

import type { DependencyContainer } from 'tsyringe';
import type Database from 'better-sqlite3';

import type { IWorkflowRepository } from '../../../application/ports/output/repositories/workflow-repository.interface.js';
import { SQLiteWorkflowRepository } from '../../repositories/sqlite-workflow.repository.js';
import type { IWorkflowExecutionRepository } from '../../../application/ports/output/repositories/workflow-execution-repository.interface.js';
import { SQLiteWorkflowExecutionRepository } from '../../repositories/sqlite-workflow-execution.repository.js';
import type { IClock } from '../../../application/ports/output/services/clock.interface.js';
import { RealClock } from '../../services/clock.js';

import { CreateScheduledWorkflowUseCase } from '../../../application/use-cases/scheduled-workflows/create-scheduled-workflow.use-case.js';
import { UpdateScheduledWorkflowUseCase } from '../../../application/use-cases/scheduled-workflows/update-scheduled-workflow.use-case.js';
import { DeleteScheduledWorkflowUseCase } from '../../../application/use-cases/scheduled-workflows/delete-scheduled-workflow.use-case.js';
import { ListScheduledWorkflowsUseCase } from '../../../application/use-cases/scheduled-workflows/list-scheduled-workflows.use-case.js';
import { GetScheduledWorkflowUseCase } from '../../../application/use-cases/scheduled-workflows/get-scheduled-workflow.use-case.js';
import { RunScheduledWorkflowUseCase } from '../../../application/use-cases/scheduled-workflows/run-scheduled-workflow.use-case.js';
import { ScheduleScheduledWorkflowUseCase } from '../../../application/use-cases/scheduled-workflows/schedule-scheduled-workflow.use-case.js';
import { GetScheduledWorkflowHistoryUseCase } from '../../../application/use-cases/scheduled-workflows/get-scheduled-workflow-history.use-case.js';
import { ToggleScheduledWorkflowUseCase } from '../../../application/use-cases/scheduled-workflows/toggle-scheduled-workflow.use-case.js';

export function registerScheduledWorkflows(c: DependencyContainer): void {
  // Repositories
  c.register<IWorkflowRepository>('IWorkflowRepository', {
    useFactory: (container) => {
      const database = container.resolve<Database.Database>('Database');
      return new SQLiteWorkflowRepository(database);
    },
  });

  c.register<IWorkflowExecutionRepository>('IWorkflowExecutionRepository', {
    useFactory: (container) => {
      const database = container.resolve<Database.Database>('Database');
      return new SQLiteWorkflowExecutionRepository(database);
    },
  });

  // Clock service
  c.registerInstance<IClock>('IClock', new RealClock());

  // Use cases
  c.registerSingleton(CreateScheduledWorkflowUseCase);
  c.registerSingleton(UpdateScheduledWorkflowUseCase);
  c.registerSingleton(DeleteScheduledWorkflowUseCase);
  c.registerSingleton(ListScheduledWorkflowsUseCase);
  c.registerSingleton(GetScheduledWorkflowUseCase);
  c.registerSingleton(RunScheduledWorkflowUseCase);
  c.registerSingleton(ScheduleScheduledWorkflowUseCase);
  c.registerSingleton(GetScheduledWorkflowHistoryUseCase);
  c.registerSingleton(ToggleScheduledWorkflowUseCase);
}
