/**
 * Start Repository Deployment Use Case
 *
 * Starts a local dev server rooted at a repository's top-level directory.
 *
 * Business Rules:
 * - repositoryPath must be an absolute path
 * - The directory must exist on disk
 * - Rejects the currently running Shep instance's own repository
 *
 * Delegates the start to the agentic dev-server flow
 * (`IDevServerAgentService`, spec 103) and returns the deployment status
 * once the run is accepted (Analyzing).
 */

import { isAbsolute } from 'node:path';
import { injectable, inject } from 'tsyringe';
import type { DeploymentStatus } from '../../ports/output/services/deployment-service.interface.js';
import type { IDevServerAgentService } from '../../ports/output/services/dev-server-agent-service.interface.js';
import type { IFileSystemService } from '../../ports/output/services/file-system-service.interface.js';
import type { IShepInstanceService } from '../../ports/output/services/shep-instance-service.interface.js';

@injectable()
export class StartRepositoryDeploymentUseCase {
  constructor(
    @inject('IDevServerAgentService') private readonly devServerAgent: IDevServerAgentService,
    @inject('IFileSystemService') private readonly fileSystem: IFileSystemService,
    @inject('IShepInstanceService') private readonly shepInstance: IShepInstanceService
  ) {}

  async execute(repositoryPath: string): Promise<DeploymentStatus> {
    if (!repositoryPath || !isAbsolute(repositoryPath)) {
      throw new Error('repositoryPath must be an absolute path');
    }

    if (!this.fileSystem.pathExists(repositoryPath)) {
      throw new Error(`Directory does not exist: ${repositoryPath}`);
    }

    if (this.shepInstance.isSameInstance(repositoryPath)) {
      throw new Error('Cannot start a dev server for the repository Shep is running from');
    }

    const result = await this.devServerAgent.startDevServer(
      repositoryPath,
      repositoryPath,
      'repository'
    );

    return { state: result.state, url: null };
  }
}
