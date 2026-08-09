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
 * Delegates the start to the agentic dev-server flow
 * (`IDevServerAgentService`, spec 103) and returns the deployment status
 * once the run is accepted (Analyzing).
 */

import { injectable, inject } from 'tsyringe';
import { DeploymentTargetType } from '../../../domain/generated/output.js';
import type { IFeatureRepository } from '../../ports/output/repositories/feature-repository.interface.js';
import type { DeploymentStatus } from '../../ports/output/services/deployment-service.interface.js';
import type { IDevServerAgentService } from '../../ports/output/services/dev-server-agent-service.interface.js';
import type { IFileSystemService } from '../../ports/output/services/file-system-service.interface.js';
import type { IShepInstanceService } from '../../ports/output/services/shep-instance-service.interface.js';
import type { IWorktreePathProvider } from '../../ports/output/services/worktree-path-provider.interface.js';

@injectable()
export class StartFeatureDeploymentUseCase {
  constructor(
    @inject('IFeatureRepository') private readonly featureRepo: IFeatureRepository,
    @inject('IDevServerAgentService') private readonly devServerAgent: IDevServerAgentService,
    @inject('IFileSystemService') private readonly fileSystem: IFileSystemService,
    @inject('IShepInstanceService') private readonly shepInstance: IShepInstanceService,
    @inject('IWorktreePathProvider') private readonly worktreePaths: IWorktreePathProvider
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
      feature.worktreePath ??
      this.worktreePaths.getWorktreePath(feature.repositoryPath, feature.branch);

    if (!this.fileSystem.pathExists(worktreePath)) {
      throw new Error(`Worktree path does not exist: ${worktreePath}`);
    }

    const result = await this.devServerAgent.startDevServer(
      featureId,
      worktreePath,
      DeploymentTargetType.Feature
    );

    return { state: result.state, url: null };
  }
}
