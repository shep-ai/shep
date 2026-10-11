/**
 * Git checkpoints (spec 138): the plumbing service, the repository and the
 * use cases, plus string-token aliases for web server actions.
 */

import type { DependencyContainer } from 'tsyringe';
import type Database from 'better-sqlite3';

import type { IGitCheckpointRepository } from '../../../application/ports/output/repositories/git-checkpoint-repository.interface.js';
import type { IGitCheckpointService } from '../../../application/ports/output/services/git-checkpoint-service.interface.js';
import { SQLiteGitCheckpointRepository } from '../../repositories/sqlite-git-checkpoint.repository.js';
import { GitCheckpointService } from '../../services/git/git-checkpoint.service.js';
import { CaptureFeatureCheckpointUseCase } from '../../../application/use-cases/features/checkpoints/capture-feature-checkpoint.use-case.js';
import { ListFeatureCheckpointsUseCase } from '../../../application/use-cases/features/checkpoints/list-feature-checkpoints.use-case.js';
import { GetFeatureCheckpointDiffUseCase } from '../../../application/use-cases/features/checkpoints/get-feature-checkpoint-diff.use-case.js';
import { RestoreFeatureCheckpointUseCase } from '../../../application/use-cases/features/checkpoints/restore-feature-checkpoint.use-case.js';
import { DeleteFeatureCheckpointsUseCase } from '../../../application/use-cases/features/checkpoints/delete-feature-checkpoints.use-case.js';

export function registerGitCheckpoints(container: DependencyContainer): void {
  container.register<IGitCheckpointRepository>('IGitCheckpointRepository', {
    useFactory: (c) => new SQLiteGitCheckpointRepository(c.resolve<Database.Database>('Database')),
  });
  // Singleton: the service holds the in-process cache of checkpoint diffs.
  container.registerSingleton<IGitCheckpointService>('IGitCheckpointService', GitCheckpointService);

  container.registerSingleton(CaptureFeatureCheckpointUseCase);
  container.registerSingleton(ListFeatureCheckpointsUseCase);
  container.registerSingleton(GetFeatureCheckpointDiffUseCase);
  container.registerSingleton(RestoreFeatureCheckpointUseCase);
  container.registerSingleton(DeleteFeatureCheckpointsUseCase);

  container.register('CaptureFeatureCheckpointUseCase', {
    useFactory: (c) => c.resolve(CaptureFeatureCheckpointUseCase),
  });
  container.register('ListFeatureCheckpointsUseCase', {
    useFactory: (c) => c.resolve(ListFeatureCheckpointsUseCase),
  });
  container.register('GetFeatureCheckpointDiffUseCase', {
    useFactory: (c) => c.resolve(GetFeatureCheckpointDiffUseCase),
  });
  container.register('RestoreFeatureCheckpointUseCase', {
    useFactory: (c) => c.resolve(RestoreFeatureCheckpointUseCase),
  });
  container.register('DeleteFeatureCheckpointsUseCase', {
    useFactory: (c) => c.resolve(DeleteFeatureCheckpointsUseCase),
  });
}
