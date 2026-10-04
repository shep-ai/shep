/**
 * Signals and opportunities (spec 126): repositories and use cases, plus
 * string-token aliases for web server actions.
 */

import type { DependencyContainer } from 'tsyringe';
import type Database from 'better-sqlite3';

import type {
  IOpportunityRepository,
  IOpportunityWeightsRepository,
  ISignalRepository,
} from '../../../application/ports/output/repositories/opportunity-repository.interface.js';
import {
  SQLiteOpportunityRepository,
  SQLiteOpportunityWeightsRepository,
  SQLiteSignalRepository,
} from '../../repositories/sqlite-opportunity.repository.js';

import { ManageSignalsUseCase } from '../../../application/use-cases/opportunities/manage-signals.use-case.js';
import { ManageOpportunitiesUseCase } from '../../../application/use-cases/opportunities/manage-opportunities.use-case.js';
import { GetOpportunityBoardUseCase } from '../../../application/use-cases/opportunities/get-opportunity-board.use-case.js';
import { ManageOpportunityWeightsUseCase } from '../../../application/use-cases/opportunities/manage-opportunity-weights.use-case.js';
import { BuildOpportunityUseCase } from '../../../application/use-cases/opportunities/build-opportunity.use-case.js';

export function registerOpportunities(container: DependencyContainer): void {
  container.register<ISignalRepository>('ISignalRepository', {
    useFactory: (c) => new SQLiteSignalRepository(c.resolve<Database.Database>('Database')),
  });
  container.register<IOpportunityRepository>('IOpportunityRepository', {
    useFactory: (c) => new SQLiteOpportunityRepository(c.resolve<Database.Database>('Database')),
  });
  container.register<IOpportunityWeightsRepository>('IOpportunityWeightsRepository', {
    useFactory: (c) =>
      new SQLiteOpportunityWeightsRepository(c.resolve<Database.Database>('Database')),
  });

  container.registerSingleton(ManageSignalsUseCase);
  container.registerSingleton(ManageOpportunitiesUseCase);
  container.registerSingleton(GetOpportunityBoardUseCase);
  container.registerSingleton(ManageOpportunityWeightsUseCase);
  container.registerSingleton(BuildOpportunityUseCase);

  container.register('ManageSignalsUseCase', {
    useFactory: (c) => c.resolve(ManageSignalsUseCase),
  });
  container.register('ManageOpportunitiesUseCase', {
    useFactory: (c) => c.resolve(ManageOpportunitiesUseCase),
  });
  container.register('GetOpportunityBoardUseCase', {
    useFactory: (c) => c.resolve(GetOpportunityBoardUseCase),
  });
  container.register('ManageOpportunityWeightsUseCase', {
    useFactory: (c) => c.resolve(ManageOpportunityWeightsUseCase),
  });
  container.register('BuildOpportunityUseCase', {
    useFactory: (c) => c.resolve(BuildOpportunityUseCase),
  });
}
