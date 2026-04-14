import { inject, injectable } from 'tsyringe';
import path from 'node:path';

import type { IApplicationRepository } from '../../ports/output/repositories/application-repository.interface.js';
import type { IFileSystemService } from '../../ports/output/services/file-system-service.interface.js';
import type { ICloudDeploymentEventBus } from '../../ports/output/services/cloud-deployment-event-bus.interface.js';
import type { ICloudDeploymentProviderRegistry } from '../../ports/output/services/cloud-deployment-provider-registry.interface.js';
import type { ILogger } from '../../ports/output/services/logger.interface.js';
import type { IOperationLogService } from '../../ports/output/services/operation-log-service.interface.js';
import type { IProjectBuildService } from '../../ports/output/services/project-build-service.interface.js';
import {
  CloudDeploymentProvider,
  CloudDeploymentStatus,
  OperationLogKind,
  OperationLogLevel,
} from '../../../domain/generated/output.js';
import { ApplicationNotFoundError } from '../../../domain/errors/application-not-found.error.js';
import { cleanDeployName } from '../../../domain/shared/clean-name.js';
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
    private readonly opLog: IOperationLogService,
    @inject('IProjectBuildService')
    private readonly buildService: IProjectBuildService
  ) {}

  async execute(input: InitiateCloudDeploymentInput): Promise<InitiateCloudDeploymentResult> {
    const opId = input.applicationId;
    const opKind = OperationLogKind.CloudDeploy;

    const app = await this.applicationRepo.findById(input.applicationId);
    if (!app) {
      await this.opLog.error(opKind, opId, `Application not found: ${input.applicationId}`);
      throw new ApplicationNotFoundError(input.applicationId);
    }
    // Note: we deliberately do NOT gate on `app.setupComplete` here.
    // That flag was originally a guard against deploying a half-
    // scaffolded brand-new app whose initial AI-generated build hadn't
    // finished yet, but it has two failure modes that hurt real users:
    //   1. Legacy apps created before setup_complete was a column
    //      have it stuck on `false` forever.
    //   2. Apps where the orchestrator was killed mid-scaffold (a dev
    //      restart, a crash, a manual stop) end up with the flag stuck
    //      on `false` even though every meaningful artifact is in place
    //      — the user has been editing, the repo has commits, etc.
    // The real precondition for a deploy is "does a build output dir
    // exist?", which `resolveBuildOutputDir()` checks below and throws
    // `BuildOutputNotFoundError` for. That's a more accurate, more
    // actionable error than this paternalistic flag check, so we let
    // it be the gatekeeper instead.

    // Provider resolution order:
    //   1. Explicit input.provider from the caller — wins unconditionally
    //   2. The per-application `app.cloudDeploymentProvider` — set by the
    //      SelectCloudProvider use case when the user picks one from the UI
    //   3. Fallback: pick the first enabled + connected provider from the
    //      registry. This makes the happy path "click Deploy without first
    //      fiddling with a provider picker" work — if the user has exactly
    //      one connected provider there's no ambiguity, and if they have
    //      multiple the first-wins tiebreak is predictable.
    //
    // Earlier code threw NoProviderSelectedError on step 2 missing, which
    // left users staring at an error for an action that should just work.
    let providerId: CloudDeploymentProvider | undefined =
      input.provider ?? (app.cloudDeploymentProvider as CloudDeploymentProvider | undefined);
    if (!providerId) {
      const firstConnected = await this.findFirstConnectedProvider();
      if (firstConnected) {
        providerId = firstConnected;
        // Persist the auto-pick onto the Application row so subsequent
        // deploys from any entry point (CLI, web, script) see the same
        // selection the user implicitly agreed to on this click.
        await this.applicationRepo.update(input.applicationId, {
          cloudDeploymentProvider: providerId,
        });
        await this.opLog.info(
          opKind,
          opId,
          `Auto-selected provider ${providerId} (first connected)`
        );
      }
    }
    if (!providerId) {
      await this.opLog.error(
        opKind,
        opId,
        'No cloud provider connected — connect one from the Deploy panel first'
      );
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

    // Re-run the project's build script so the deploy always ships fresh output.
    await this.opLog.info(opKind, opId, `Building project before deploy…`);
    try {
      await this.buildService.buildProject(app.repositoryPath, (line) => {
        void this.opLog.debug(opKind, opId, line);
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await this.opLog.error(opKind, opId, `Build failed: ${msg}`);
      throw err;
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
          // Use the clean display-name-derived slug (no random suffix)
          // so the Cloudflare Pages project has a human-readable name.
          // The random suffix stays on app.slug for local folder uniqueness.
          projectName: cleanDeployName(app.name),
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

  /**
   * Walk the provider registry in declared order and return the first
   * provider that is both `enabled` AND `isConnected()`. Used to pick
   * a sensible default when a deploy is initiated on an application
   * that has no explicit `cloudDeploymentProvider` yet.
   *
   * Returns `null` if nothing is connected — the caller then throws
   * NoProviderSelectedError with a friendlier "connect something first"
   * message.
   */
  private async findFirstConnectedProvider(): Promise<CloudDeploymentProvider | null> {
    const descriptors = this.registry.listAll();
    for (const descriptor of descriptors) {
      if (!descriptor.enabled) continue;
      const provider = this.registry.get(descriptor.id);
      try {
        if (await provider.isConnected()) return descriptor.id;
      } catch {
        // isConnected() can throw on transient token-verify failures.
        // Treat as "not connected" and keep searching.
      }
    }
    return null;
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
