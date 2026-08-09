/**
 * Start Application Deployment Use Case
 *
 * Starts a local dev server for an application, keyed by the application's
 * stable ID (UUID) so multiple applications at similar paths can't collide
 * in the `dev_servers` table. The start itself is delegated to the agentic
 * dev-server flow (`IDevServerAgentService`, spec 103) — analysis, install,
 * spawn, verification, and remediation all happen inside the graph while
 * this use case returns as soon as the run is accepted (Analyzing).
 *
 * Business Rules:
 * - applicationId must be non-empty
 * - The application must exist in the repository
 * - The application's repositoryPath must exist on disk
 * - Rejects the currently running Shep instance's own repository
 *
 * The `IDeploymentService` writes to the `dev_servers` SQLite table on spawn,
 * updates it on Ready (with the detected URL), and removes the row on stop —
 * so deployment state is fully persisted across page reloads AND service
 * restarts (`recoverAll()` reconciles live PIDs on startup).
 *
 * Extracted from the `deployApplication` server action as part of clean-arch
 * violations #1, #2, #3 cleanup (see specs/089-one-click-cloud-deploy/
 * clean-arch-violations.md).
 */

import { inject, injectable } from 'tsyringe';

import { DeploymentTargetType } from '../../../domain/generated/output.js';
import type { IApplicationRepository } from '../../ports/output/repositories/application-repository.interface.js';
import type { IDevServerAgentService } from '../../ports/output/services/dev-server-agent-service.interface.js';
import type { IFileSystemService } from '../../ports/output/services/file-system-service.interface.js';
import type { IShepInstanceService } from '../../ports/output/services/shep-instance-service.interface.js';
import type { ILogger } from '../../ports/output/services/logger.interface.js';
import type { DeploymentState } from '../../../domain/generated/output.js';
import { ApplicationNotFoundError } from '../../../domain/errors/application-not-found.error.js';
import { ApplicationRepositoryNotOnDiskError } from '../../../domain/errors/application-repository-not-on-disk.error.js';
import { CannotDeploySelfError } from '../../../domain/errors/cannot-deploy-self.error.js';

export interface StartApplicationDeploymentInput {
  applicationId: string;
}

/**
 * Result DTO preserving the exact shape the `deployApplication` server
 * action historically returned to its callers.
 */
export interface StartApplicationDeploymentResult {
  state: DeploymentState;
}

@injectable()
export class StartApplicationDeploymentUseCase {
  constructor(
    @inject('IApplicationRepository')
    private readonly applicationRepo: IApplicationRepository,
    @inject('IFileSystemService')
    private readonly fileSystem: IFileSystemService,
    @inject('IShepInstanceService')
    private readonly shepInstance: IShepInstanceService,
    @inject('IDevServerAgentService')
    private readonly devServerAgent: IDevServerAgentService,
    @inject('ILogger')
    private readonly logger: ILogger
  ) {}

  async execute(input: StartApplicationDeploymentInput): Promise<StartApplicationDeploymentResult> {
    const { applicationId } = input;
    this.logger.info('[StartApplicationDeploymentUseCase] called', { applicationId });

    if (!applicationId?.trim()) {
      this.logger.warn('[StartApplicationDeploymentUseCase] rejected — applicationId is empty');
      throw new Error('applicationId is required');
    }

    const application = await this.applicationRepo.findById(applicationId);
    if (!application) {
      this.logger.warn('[StartApplicationDeploymentUseCase] application not found', {
        applicationId,
      });
      throw new ApplicationNotFoundError(applicationId);
    }

    const repositoryPath = application.repositoryPath;
    this.logger.info('[StartApplicationDeploymentUseCase] application found', {
      applicationId,
      repositoryPath,
    });

    if (!this.fileSystem.pathExists(repositoryPath)) {
      this.logger.warn(
        '[StartApplicationDeploymentUseCase] repository path does not exist on disk',
        { applicationId, repositoryPath }
      );
      throw new ApplicationRepositoryNotOnDiskError(applicationId, repositoryPath);
    }

    if (this.shepInstance.isSameInstance(repositoryPath)) {
      this.logger.warn(
        '[StartApplicationDeploymentUseCase] rejected — target is the running shep instance',
        { applicationId, repositoryPath }
      );
      throw new CannotDeploySelfError(repositoryPath);
    }

    this.logger.info(
      '[StartApplicationDeploymentUseCase] repository exists, launching dev-server agent',
      { applicationId }
    );
    // Key by applicationId (not repositoryPath) so each application is its
    // own first-class row in `dev_servers` — keeps recovery and the
    // dev-server lifecycle isolated per application even if two apps
    // happened to share a filesystem root.
    const result = await this.devServerAgent.startDevServer(
      applicationId,
      repositoryPath,
      DeploymentTargetType.Application
    );

    this.logger.info('[StartApplicationDeploymentUseCase] dev-server agent run accepted', {
      applicationId,
      state: result.state,
    });
    return { state: result.state };
  }
}
