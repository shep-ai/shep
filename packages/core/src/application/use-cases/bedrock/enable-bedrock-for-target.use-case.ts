/**
 * Enable Bedrock For Target Use Case
 *
 * Generalizes the application-only EnableBedrockForApplication use case
 * to support every bedrock-capable entity: Application | Repository |
 * Feature. The use case:
 *
 *   1. Resolves the target entity via its kind + id.
 *   2. Persists `bedrockEnabled = true` on that entity (idempotent —
 *      a no-op when already enabled).
 *   3. Invokes `IBedrockIntegrationService.init()` with the entity's
 *      resolved worktree path.
 *
 * This is the single entry point used by the CLI (`shep bedrock init`)
 * and every web server action (`enableBedrockForApplication`,
 * `enableBedrockForRepository`, `enableBedrockForFeature`).
 */

import { injectable, inject } from 'tsyringe';

import { ApplicationNotFoundError } from '../../../domain/errors/application-not-found.error.js';
import { BedrockTargetKind } from '../../../domain/generated/output.js';
import type {
  BedrockLifecycleResult,
  BedrockProgressHandler,
  IBedrockIntegrationService,
} from '../../ports/output/services/bedrock-integration.service.js';
import type { IApplicationRepository } from '../../ports/output/repositories/application-repository.interface.js';
import type { IFeatureRepository } from '../../ports/output/repositories/feature-repository.interface.js';
import type { IRepositoryRepository } from '../../ports/output/repositories/repository-repository.interface.js';

export interface EnableBedrockForTargetInput {
  kind: BedrockTargetKind;
  id: string;
  onProgress?: BedrockProgressHandler;
}

interface ResolvedTarget {
  cwd: string;
  alreadyEnabled: boolean;
  persistEnabled: () => Promise<void>;
}

@injectable()
export class EnableBedrockForTargetUseCase {
  constructor(
    @inject('IApplicationRepository')
    private readonly appRepo: IApplicationRepository,
    @inject('IRepositoryRepository')
    private readonly repoRepo: IRepositoryRepository,
    @inject('IFeatureRepository')
    private readonly featureRepo: IFeatureRepository,
    @inject('IBedrockIntegrationService')
    private readonly bedrock: IBedrockIntegrationService
  ) {}

  async execute(input: EnableBedrockForTargetInput): Promise<BedrockLifecycleResult> {
    const target = await this.resolveTarget(input.kind, input.id);

    if (!target.alreadyEnabled) {
      await target.persistEnabled();
    }

    return this.bedrock.init({
      cwd: target.cwd,
      onProgress: input.onProgress,
    });
  }

  private async resolveTarget(kind: BedrockTargetKind, id: string): Promise<ResolvedTarget> {
    switch (kind) {
      case BedrockTargetKind.Application: {
        const app = await this.appRepo.findById(id);
        if (!app) throw new ApplicationNotFoundError(id);
        return {
          cwd: app.repositoryPath,
          alreadyEnabled: app.bedrockEnabled === true,
          persistEnabled: async () => {
            await this.appRepo.update(app.id, { bedrockEnabled: true });
          },
        };
      }
      case BedrockTargetKind.Repository: {
        const repo = await this.repoRepo.findById(id);
        if (!repo) throw new Error(`Repository not found: ${id}`);
        return {
          cwd: repo.path,
          alreadyEnabled: repo.bedrockEnabled === true,
          persistEnabled: async () => {
            await this.repoRepo.update(repo.id, { bedrockEnabled: true });
          },
        };
      }
      case BedrockTargetKind.Feature: {
        const feature = await this.featureRepo.findById(id);
        if (!feature) throw new Error(`Feature not found: ${id}`);
        return {
          cwd: feature.worktreePath ?? feature.repositoryPath,
          alreadyEnabled: feature.bedrockEnabled === true,
          persistEnabled: async () => {
            await this.featureRepo.update({ ...feature, bedrockEnabled: true });
          },
        };
      }
      default: {
        const unreachable: never = kind;
        throw new Error(`Unhandled BedrockTargetKind: ${String(unreachable)}`);
      }
    }
  }
}
