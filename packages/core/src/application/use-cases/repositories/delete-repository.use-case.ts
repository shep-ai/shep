/**
 * Delete Repository Use Case
 *
 * Deletes a Repository and all its child features.
 * Each feature is properly cleaned up (agent runs cancelled, worktrees removed)
 * via DeleteFeatureUseCase before the repository is soft-deleted.
 *
 * Optionally removes the repository directory from disk when
 * {@link DeleteRepositoryOptions.deleteFromDisk} is true. The DB soft-delete
 * always runs first so the repository disappears from queries even if the
 * filesystem removal fails.
 */

import { injectable, inject } from 'tsyringe';
import type { IRepositoryRepository } from '../../ports/output/repositories/repository-repository.interface.js';
import type { IFeatureRepository } from '../../ports/output/repositories/feature-repository.interface.js';
import type { IFileSystemService } from '../../ports/output/services/file-system-service.interface.js';
import { DeleteFeatureUseCase } from '../features/delete-feature.use-case.js';

export interface DeleteRepositoryOptions {
  /** When true, recursively remove the repository directory from disk. */
  deleteFromDisk?: boolean;
}

@injectable()
export class DeleteRepositoryUseCase {
  constructor(
    @inject('IRepositoryRepository')
    private readonly repositoryRepo: IRepositoryRepository,
    @inject('IFeatureRepository')
    private readonly featureRepo: IFeatureRepository,
    @inject(DeleteFeatureUseCase)
    private readonly deleteFeature: DeleteFeatureUseCase,
    @inject('IFileSystemService')
    private readonly fileSystem: IFileSystemService
  ) {}

  async execute(id: string, options?: DeleteRepositoryOptions): Promise<void> {
    const repository = await this.repositoryRepo.findById(id);
    if (!repository) {
      throw new Error(`Repository not found: "${id}"`);
    }

    // Delete all child features (cancels agent runs, removes worktrees).
    // Include archived features so they don't survive as orphans.
    const features = await this.featureRepo.list({
      repositoryPath: repository.path,
      includeArchived: true,
    });
    for (const feature of features) {
      await this.deleteFeature.execute(feature.id);
    }

    await this.repositoryRepo.softDelete(id);

    if (options?.deleteFromDisk) {
      await this.fileSystem.removeDirectory(repository.path);
    }
  }
}
