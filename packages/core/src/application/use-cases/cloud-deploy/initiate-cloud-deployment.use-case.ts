import { inject, injectable } from 'tsyringe';
import path from 'node:path';

import type { IApplicationRepository } from '../../ports/output/repositories/application-repository.interface.js';
import type { IFileSystemService } from '../../ports/output/services/file-system-service.interface.js';
import type { ICloudDeploymentEventBus } from '../../ports/output/services/cloud-deployment-event-bus.interface.js';
import type { ICloudDeploymentProviderRegistry } from '../../ports/output/services/cloud-deployment-provider-registry.interface.js';
import {
  BuildOutputNotFoundError,
  CloudProviderNotConnectedError,
  ProviderNotImplementedError,
} from '../../ports/output/services/cloud-deployment-provider.interface.js';
import type { ILogger } from '../../ports/output/services/logger.interface.js';
import {
  CloudDeploymentProvider,
  CloudDeploymentStatus,
} from '../../../domain/generated/output.js';
import { ApplicationNotFoundError } from './select-cloud-provider.use-case.js';

export class ApplicationNotReadyError extends Error {
  readonly code = 'APPLICATION_NOT_READY';
  constructor(applicationId: string) {
    super(`Application ${applicationId} has not completed setup yet — cannot deploy`);
  }
}

export class NoProviderSelectedError extends Error {
  readonly code = 'NO_PROVIDER_SELECTED';
  constructor(applicationId: string) {
    super(`Application ${applicationId} has no cloud deployment provider selected`);
  }
}

export interface InitiateCloudDeploymentInput {
  applicationId: string;
  /** Optional override — falls back to Application.cloudDeploymentProvider. */
  provider?: CloudDeploymentProvider;
}

export interface InitiateCloudDeploymentResult {
  deploymentId: string;
  url: string;
}

const BUILD_OUTPUT_CANDIDATES = ['dist', 'build', '.next', 'out'];

@injectable()
export class InitiateCloudDeploymentUseCase {
  constructor(
    @inject('IApplicationRepository')
    private readonly applicationRepo: IApplicationRepository,
    @inject('ICloudDeploymentProviderRegistry')
    private readonly registry: ICloudDeploymentProviderRegistry,
    @inject('IFileSystemService')
    private readonly fs: IFileSystemService,
    @inject('ICloudDeploymentEventBus')
    private readonly eventBus: ICloudDeploymentEventBus,
    @inject('ILogger')
    private readonly logger: ILogger
  ) {}

  async execute(input: InitiateCloudDeploymentInput): Promise<InitiateCloudDeploymentResult> {
    const app = await this.applicationRepo.findById(input.applicationId);
    if (!app) throw new ApplicationNotFoundError(input.applicationId);
    if (!app.setupComplete) throw new ApplicationNotReadyError(input.applicationId);

    const providerId =
      input.provider ?? (app.cloudDeploymentProvider as CloudDeploymentProvider | undefined);
    if (!providerId) throw new NoProviderSelectedError(input.applicationId);

    const provider = this.registry.get(providerId);
    if (!provider.enabled) throw new ProviderNotImplementedError(providerId);
    if (!(await provider.isConnected())) throw new CloudProviderNotConnectedError(providerId);

    const buildOutputDir = this.resolveBuildOutputDir(app.repositoryPath);

    // Record initial state and emit.
    await this.applicationRepo.update(input.applicationId, {
      cloudDeploymentProvider: providerId,
      cloudDeploymentStatus: CloudDeploymentStatus.Uploading,
      cloudDeploymentError: undefined,
      lastDeployedAt: new Date(),
    });
    this.publish(input.applicationId, providerId, CloudDeploymentStatus.Uploading);

    try {
      const result = await provider.deploy(
        {
          applicationId: input.applicationId,
          buildOutputDir,
          projectName: app.slug,
        },
        (status, message) => {
          void this.applicationRepo
            .update(input.applicationId, { cloudDeploymentStatus: status })
            .catch((err) =>
              this.logger.warn('failed to persist interim deploy status', { err: String(err) })
            );
          this.publish(input.applicationId, providerId, status, undefined, undefined, message);
        }
      );

      await this.applicationRepo.update(input.applicationId, {
        cloudDeploymentStatus: CloudDeploymentStatus.Deployed,
        cloudDeploymentId: result.deploymentId,
        cloudDeploymentUrl: result.url,
        cloudDeploymentError: undefined,
        lastDeployedAt: new Date(),
      });
      this.publish(input.applicationId, providerId, CloudDeploymentStatus.Deployed, result.url);
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await this.applicationRepo.update(input.applicationId, {
        cloudDeploymentStatus: CloudDeploymentStatus.Failed,
        cloudDeploymentError: message,
        lastDeployedAt: new Date(),
      });
      this.publish(
        input.applicationId,
        providerId,
        CloudDeploymentStatus.Failed,
        undefined,
        message
      );
      throw err;
    }
  }

  private resolveBuildOutputDir(repositoryPath: string): string {
    for (const candidate of BUILD_OUTPUT_CANDIDATES) {
      const full = path.join(repositoryPath, candidate);
      if (this.fs.pathExists(full)) return full;
    }
    throw new BuildOutputNotFoundError(
      BUILD_OUTPUT_CANDIDATES.map((c) => path.join(repositoryPath, c))
    );
  }

  private publish(
    applicationId: string,
    provider: CloudDeploymentProvider,
    status: CloudDeploymentStatus,
    url?: string,
    error?: string,
    message?: string
  ): void {
    this.eventBus.publish({
      applicationId,
      provider,
      status,
      url,
      error,
      message,
      timestamp: Date.now(),
    });
  }
}
