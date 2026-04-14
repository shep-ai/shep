import { inject, injectable } from 'tsyringe';
import path from 'node:path';

import type { IApplicationRepository } from '../../ports/output/repositories/application-repository.interface.js';
import type { IFileSystemService } from '../../ports/output/services/file-system-service.interface.js';
import type { ICloudDeploymentEventBus } from '../../ports/output/services/cloud-deployment-event-bus.interface.js';
import type { ICloudDeploymentProviderRegistry } from '../../ports/output/services/cloud-deployment-provider-registry.interface.js';
import type { ILogger } from '../../ports/output/services/logger.interface.js';
import type { IOperationLogService } from '../../ports/output/services/operation-log-service.interface.js';
import {
  CloudDeploymentProvider,
  CloudDeploymentStatus,
  OperationLogKind,
  OperationLogLevel,
} from '../../../domain/generated/output.js';
import { ApplicationNotFoundError } from '../../../domain/errors/application-not-found.error.js';
import { ApplicationNotReadyError } from '../../../domain/errors/application-not-ready.error.js';
import { NoProviderSelectedError } from '../../../domain/errors/no-provider-selected.error.js';
import { BuildOutputNotFoundError } from '../../../domain/errors/build-output-not-found.error.js';
import { CloudProviderNotConnectedError } from '../../../domain/errors/cloud-provider-not-connected.error.js';
import { ProviderNotImplementedError } from '../../../domain/errors/provider-not-implemented.error.js';

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
    private readonly logger: ILogger,
    @inject('IOperationLogService')
    private readonly opLog: IOperationLogService
  ) {}

  async execute(input: InitiateCloudDeploymentInput): Promise<InitiateCloudDeploymentResult> {
    const opId = input.applicationId;
    const opKind = OperationLogKind.CloudDeploy;

    const app = await this.applicationRepo.findById(input.applicationId);
    if (!app) {
      await this.opLog.error(opKind, opId, `Application not found: ${input.applicationId}`);
      throw new ApplicationNotFoundError(input.applicationId);
    }
    if (!app.setupComplete) {
      await this.opLog.error(opKind, opId, 'Application setup is not complete — cannot deploy');
      throw new ApplicationNotReadyError(input.applicationId);
    }

    const providerId =
      input.provider ?? (app.cloudDeploymentProvider as CloudDeploymentProvider | undefined);
    if (!providerId) {
      await this.opLog.error(opKind, opId, 'No cloud provider selected for this application');
      throw new NoProviderSelectedError(input.applicationId);
    }

    await this.opLog.info(opKind, opId, `Starting deploy to ${providerId}`);

    const provider = this.registry.get(providerId);
    if (!provider.enabled) {
      await this.opLog.error(opKind, opId, `Provider ${providerId} is not enabled in this build`);
      throw new ProviderNotImplementedError(providerId);
    }
    if (!(await provider.isConnected())) {
      await this.opLog.error(
        opKind,
        opId,
        `Provider ${providerId} reports not connected (token missing or invalid)`
      );
      throw new CloudProviderNotConnectedError(providerId);
    }

    const buildOutputDir = this.resolveBuildOutputDir(app.repositoryPath);
    await this.opLog.info(opKind, opId, `Resolved build output directory: ${buildOutputDir}`);

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
            .catch((errr) =>
              this.logger.warn('failed to persist interim deploy status', { err: String(errr) })
            );
          this.publish(input.applicationId, providerId, status, undefined, undefined, message);
          // Persist the lifecycle transition as a user-visible log entry too
          // — `void` because we never want a logging hiccup to abort a deploy.
          void this.opLog.info(opKind, opId, message ?? `Status transitioned to ${status}`);
        },
        // Provider-internal log lines flow through this callback. The provider
        // never touches the log store directly — the use case is the only
        // thing that calls IOperationLogService.
        (level, message, detail) => {
          void this.appendInternalLog(opKind, opId, level, message, detail);
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
      await this.opLog.info(opKind, opId, `Deploy succeeded — live at ${result.url}`);
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
      await this.opLog.error(
        opKind,
        opId,
        `Deploy failed: ${message}`,
        err instanceof Error && err.stack ? err.stack : undefined
      );
      throw err;
    }
  }

  /**
   * Single funnel for provider-emitted log lines — translates the
   * level enum into the right opLog method. Kept private so callers
   * can't accidentally bypass the level→method mapping.
   */
  private appendInternalLog(
    kind: OperationLogKind,
    id: string,
    level: OperationLogLevel,
    message: string,
    detail?: string
  ): Promise<unknown> {
    switch (level) {
      case OperationLogLevel.Debug:
        return this.opLog.debug(kind, id, message, detail);
      case OperationLogLevel.Info:
        return this.opLog.info(kind, id, message, detail);
      case OperationLogLevel.Warn:
        return this.opLog.warn(kind, id, message, detail);
      case OperationLogLevel.Error:
        return this.opLog.error(kind, id, message, detail);
      default:
        return this.opLog.info(kind, id, message, detail);
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
