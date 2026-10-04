/**
 * Bug loop (spec 123): the investigation repository, the detached-worktree
 * workspace and the use cases, plus string-token aliases for web server
 * actions.
 */

import { join } from 'node:path';
import type { DependencyContainer } from 'tsyringe';
import type Database from 'better-sqlite3';

import type { IInvestigationRepository } from '../../../application/ports/output/repositories/investigation-repository.interface.js';
import type { IInvestigationWorkspace } from '../../../application/ports/output/services/investigation-workspace.interface.js';
import { SQLiteInvestigationRepository } from '../../repositories/sqlite-investigation.repository.js';
import { GitInvestigationWorkspace } from '../../services/git/investigation-workspace.service.js';
import type { ExecFunction } from '../../services/git/worktree.service.js';
import { getShepHomeDir } from '../../services/filesystem/shep-directory.service.js';

import { InvestigateWorkItemUseCase } from '../../../application/use-cases/bug-loop/investigate-work-item.use-case.js';
import { ApproveHypothesisUseCase } from '../../../application/use-cases/bug-loop/approve-hypothesis.use-case.js';
import { GetWorkItemInvestigationsUseCase } from '../../../application/use-cases/bug-loop/get-work-item-investigations.use-case.js';

/** Directory under the shep home holding investigation checkouts; short for Windows paths. */
const INVESTIGATIONS_DIRECTORY = 'inv';

export function registerBugLoop(container: DependencyContainer): void {
  container.register<IInvestigationRepository>('IInvestigationRepository', {
    useFactory: (c) => new SQLiteInvestigationRepository(c.resolve<Database.Database>('Database')),
  });
  container.register<IInvestigationWorkspace>('IInvestigationWorkspace', {
    useFactory: (c) =>
      new GitInvestigationWorkspace(
        c.resolve<ExecFunction>('ExecFunction'),
        join(getShepHomeDir(), INVESTIGATIONS_DIRECTORY)
      ),
  });

  container.registerSingleton(InvestigateWorkItemUseCase);
  container.registerSingleton(ApproveHypothesisUseCase);
  container.registerSingleton(GetWorkItemInvestigationsUseCase);

  container.register('InvestigateWorkItemUseCase', {
    useFactory: (c) => c.resolve(InvestigateWorkItemUseCase),
  });
  container.register('ApproveHypothesisUseCase', {
    useFactory: (c) => c.resolve(ApproveHypothesisUseCase),
  });
  container.register('GetWorkItemInvestigationsUseCase', {
    useFactory: (c) => c.resolve(GetWorkItemInvestigationsUseCase),
  });
}
