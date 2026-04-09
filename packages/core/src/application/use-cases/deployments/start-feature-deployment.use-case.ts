/**
 * Start Feature Deployment Use Case
 *
 * Starts a local dev server for a feature's git worktree.
 *
 * Business Rules:
 * - featureId must be non-empty
 * - Feature must exist in the repository
 * - The feature's worktree path must exist on disk
 * - Rejects deployments targeting the currently running Shep instance's
 *   own repository (would create a conflicting nested Shep process)
 *
 * Returns the deployment status after the start call (Booting).
 */

import { injectable, inject } from 'tsyringe';
import type { IFeatureRepository } from '../../ports/output/repositories/feature-repository.interface.js';
import type {
  IDeploymentService,
  DeploymentStatus,
} from '../../ports/output/services/deployment-service.interface.js';
import type { IFileSystemService } from '../../ports/output/services/file-system-service.interface.js';
import type { IShepInstanceService } from '../../ports/output/services/shep-instance-service.interface.js';
import { DeploymentState } from '../../../domain/generated/output.js';
import { computeWorktreePath } from '../../../infrastructure/services/ide-launchers/compute-worktree-path.js';

@injectable()
export class StartFeatureDeploymentUseCase {
  constructor(
    @inject('IFeatureRepository') private readonly featureRepo: IFeatureRepository,
    @inject('IDeploymentService') private readonly deploymentService: IDeploymentService,
    @inject('IFileSystemService') private readonly fileSystem: IFileSystemService,
    @inject('IShepInstanceService') private readonly shepInstance: IShepInstanceService
  ) {}

  async execute(featureId: string): Promise<DeploymentStatus> {
    if (!featureId?.trim()) {
      throw new Error('featureId is required');
    }

    const feature = await this.featureRepo.findById(featureId);
    if (!feature) {
      throw new Error(`Feature not found: ${featureId}`);
    }

    if (this.shepInstance.isSameInstance(feature.repositoryPath)) {
      throw new Error(
        'Cannot start a dev server for features of the repository Shep is running from'
      );
    }

    const worktreePath =
      feature.worktreePath ?? computeWorktreePath(feature.repositoryPath, feature.branch);

    if (!this.fileSystem.pathExists(worktreePath)) {
      throw new Error(`Worktree path does not exist: ${worktreePath}`);
    }

    this.deploymentService.start(featureId, worktreePath, 'feature');

    return { state: DeploymentState.Booting, url: null };
  }
}
