/**
 * Self-learning harness (spec 150): repositories, services and use cases.
 *
 * Use cases are registered under their class (CLI, worker) and under their
 * name (web routes and server actions, which can only address core by token).
 */

import type Database from 'better-sqlite3';
import type { DependencyContainer } from 'tsyringe';

import type { ILearnedHarnessRepository } from '../../../application/ports/output/repositories/learned-harness-repository.interface.js';
import type { IHarnessRefinementRepository } from '../../../application/ports/output/repositories/harness-refinement-repository.interface.js';
import { SQLiteLearnedHarnessRepository } from '../../repositories/sqlite-learned-harness.repository.js';
import { SQLiteHarnessRefinementRepository } from '../../repositories/sqlite-harness-refinement.repository.js';

export function registerHarnessLearning(container: DependencyContainer): void {
  container.register<ILearnedHarnessRepository>('ILearnedHarnessRepository', {
    useFactory: (c) => new SQLiteLearnedHarnessRepository(c.resolve<Database.Database>('Database')),
  });
  container.register<IHarnessRefinementRepository>('IHarnessRefinementRepository', {
    useFactory: (c) =>
      new SQLiteHarnessRefinementRepository(c.resolve<Database.Database>('Database')),
  });
}
