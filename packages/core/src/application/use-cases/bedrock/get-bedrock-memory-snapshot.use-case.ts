/**
 * Get Bedrock Memory Snapshot Use Case
 *
 * Reads the on-disk `.bedrock/` memory store for a given target
 * (Application | Repository | Feature) and returns a typed snapshot
 * the web visualization can render. Resolves the worktree path from
 * the target's owning entity:
 *
 *   - Application → application.repositoryPath
 *   - Repository  → repository.path
 *   - Feature     → feature.worktreePath ?? feature.repositoryPath
 *
 * This use case is the foundation of the BedrockMemoryPanel — it lets
 * users SEE which markdown memory files bedrock has captured (sizes,
 * mtimes, preview), not just whether the integration is enabled.
 *
 * No persistence side-effects, no subprocess invocation. Errors from
 * the underlying reader are swallowed (the reader contract returns a
 * `present: false` snapshot rather than throwing) so the UI can render
 * an empty state regardless of host filesystem quirks.
 */

import { injectable, inject } from 'tsyringe';

import { ApplicationNotFoundError } from '../../../domain/errors/application-not-found.error.js';
import { BedrockTargetKind } from '../../../domain/generated/output.js';
import type { BedrockMemorySnapshot } from '../../../domain/generated/output.js';
import type { IBedrockMemoryReader } from '../../ports/output/services/bedrock-memory-reader.interface.js';
import type { IApplicationRepository } from '../../ports/output/repositories/application-repository.interface.js';
import type { IFeatureRepository } from '../../ports/output/repositories/feature-repository.interface.js';
import type { IRepositoryRepository } from '../../ports/output/repositories/repository-repository.interface.js';

export interface GetBedrockMemorySnapshotInput {
  kind: BedrockTargetKind;
  id: string;
  /** Optional cap on the per-file preview size, passed through to the reader. */
  previewBytes?: number;
}

@injectable()
export class GetBedrockMemorySnapshotUseCase {
  constructor(
    @inject('IApplicationRepository')
    private readonly appRepo: IApplicationRepository,
    @inject('IRepositoryRepository')
    private readonly repoRepo: IRepositoryRepository,
    @inject('IFeatureRepository')
    private readonly featureRepo: IFeatureRepository,
    @inject('IBedrockMemoryReader')
    private readonly reader: IBedrockMemoryReader
  ) {}

  async execute(input: GetBedrockMemorySnapshotInput): Promise<BedrockMemorySnapshot> {
    const cwd = await this.resolveCwd(input.kind, input.id);
    return this.reader.read({
      cwd,
      ...(input.previewBytes !== undefined ? { previewBytes: input.previewBytes } : {}),
    });
  }

  private async resolveCwd(kind: BedrockTargetKind, id: string): Promise<string> {
    switch (kind) {
      case BedrockTargetKind.Application: {
        const app = await this.appRepo.findById(id);
        if (!app) throw new ApplicationNotFoundError(id);
        return app.repositoryPath;
      }
      case BedrockTargetKind.Repository: {
        const repo = await this.repoRepo.findById(id);
        if (!repo) throw new Error(`Repository not found: ${id}`);
        return repo.path;
      }
      case BedrockTargetKind.Feature: {
        const feature = await this.featureRepo.findById(id);
        if (!feature) throw new Error(`Feature not found: ${id}`);
        return feature.worktreePath ?? feature.repositoryPath;
      }
      default: {
        const unreachable: never = kind;
        throw new Error(`Unhandled BedrockTargetKind: ${String(unreachable)}`);
      }
    }
  }
}
