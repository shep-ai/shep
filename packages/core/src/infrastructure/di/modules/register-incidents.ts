/**
 * Incidents (spec 129): repositories, the kubectl runtime controller, the
 * use cases, and string-token aliases for web server actions and the alert
 * endpoint.
 */

import type { DependencyContainer } from 'tsyringe';
import type Database from 'better-sqlite3';

import type {
  IIncidentEventRepository,
  IIncidentRepository,
  IRuntimeActionRepository,
} from '../../../application/ports/output/repositories/incident-repository.interface.js';
import type { IRuntimeController } from '../../../application/ports/output/services/runtime-controller.interface.js';
import {
  SQLiteIncidentEventRepository,
  SQLiteIncidentRepository,
  SQLiteRuntimeActionRepository,
} from '../../repositories/sqlite-incident.repository.js';
import { KubectlRuntimeController } from '../../services/runtime/kubectl-runtime.controller.js';
import type { ExecFunction } from '../../services/git/worktree.service.js';

import { OpenIncidentUseCase } from '../../../application/use-cases/incidents/open-incident.use-case.js';
import { ManageIncidentsUseCase } from '../../../application/use-cases/incidents/manage-incidents.use-case.js';
import { RuntimeActionsUseCase } from '../../../application/use-cases/incidents/runtime-actions.use-case.js';
import { TriageIncidentUseCase } from '../../../application/use-cases/incidents/triage-incident.use-case.js';
import { GetIncidentBoardUseCase } from '../../../application/use-cases/incidents/get-incident-board.use-case.js';
import { IngestAlertUseCase } from '../../../application/use-cases/incidents/ingest-alert.use-case.js';

export function registerIncidents(container: DependencyContainer): void {
  const database = (c: DependencyContainer) => c.resolve<Database.Database>('Database');
  container.register<IIncidentRepository>('IIncidentRepository', {
    useFactory: (c) => new SQLiteIncidentRepository(database(c)),
  });
  container.register<IIncidentEventRepository>('IIncidentEventRepository', {
    useFactory: (c) => new SQLiteIncidentEventRepository(database(c)),
  });
  container.register<IRuntimeActionRepository>('IRuntimeActionRepository', {
    useFactory: (c) => new SQLiteRuntimeActionRepository(database(c)),
  });
  container.register<IRuntimeController>('IRuntimeController', {
    useFactory: (c) => new KubectlRuntimeController(c.resolve<ExecFunction>('ExecFunction')),
  });

  container.registerSingleton(OpenIncidentUseCase);
  container.registerSingleton(ManageIncidentsUseCase);
  container.registerSingleton(RuntimeActionsUseCase);
  container.registerSingleton(TriageIncidentUseCase);
  container.registerSingleton(GetIncidentBoardUseCase);
  container.registerSingleton(IngestAlertUseCase);

  container.register('OpenIncidentUseCase', { useFactory: (c) => c.resolve(OpenIncidentUseCase) });
  container.register('ManageIncidentsUseCase', {
    useFactory: (c) => c.resolve(ManageIncidentsUseCase),
  });
  container.register('RuntimeActionsUseCase', {
    useFactory: (c) => c.resolve(RuntimeActionsUseCase),
  });
  container.register('TriageIncidentUseCase', {
    useFactory: (c) => c.resolve(TriageIncidentUseCase),
  });
  container.register('GetIncidentBoardUseCase', {
    useFactory: (c) => c.resolve(GetIncidentBoardUseCase),
  });
  container.register('IngestAlertUseCase', { useFactory: (c) => c.resolve(IngestAlertUseCase) });
}
