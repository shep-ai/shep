/**
 * Outcomes (spec 130): the outcome repository and use cases, plus
 * string-token aliases for web server actions and the daemon.
 */

import type { DependencyContainer } from 'tsyringe';
import type Database from 'better-sqlite3';

import type { IOutcomeRepository } from '../../../application/ports/output/repositories/outcome-repository.interface.js';
import { SQLiteOutcomeRepository } from '../../repositories/sqlite-outcome.repository.js';
import { TrackOutcomesUseCase } from '../../../application/use-cases/outcomes/track-outcomes.use-case.js';
import { ManageOutcomesUseCase } from '../../../application/use-cases/outcomes/manage-outcomes.use-case.js';

export function registerOutcomes(container: DependencyContainer): void {
  container.register<IOutcomeRepository>('IOutcomeRepository', {
    useFactory: (c) => new SQLiteOutcomeRepository(c.resolve<Database.Database>('Database')),
  });

  container.registerSingleton(TrackOutcomesUseCase);
  container.registerSingleton(ManageOutcomesUseCase);

  container.register('TrackOutcomesUseCase', {
    useFactory: (c) => c.resolve(TrackOutcomesUseCase),
  });
  container.register('ManageOutcomesUseCase', {
    useFactory: (c) => c.resolve(ManageOutcomesUseCase),
  });
}
