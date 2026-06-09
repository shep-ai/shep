/**
 * Delete Feature Use Case
 *
 * Orchestrates feature deletion using a two-phase soft-delete approach:
 * 1. Immediately soft-delete the feature (set deletedAt + lifecycle=Deleting)
 *    so it vanishes from all queries — prevents the "reappear" bug
 * 2. Then perform cleanup (cancel agents, remove worktree/branches)
 *
 * Business Rules:
 * - Throws if the feature does not exist
 * - Cascade soft-deletes all sub-features before deleting the parent
 * - Cancels running/pending agent runs
 * - Gracefully handles worktree removal failures
 */

import { injectable, inject } from 'tsyringe';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { unlink } from 'node:fs/promises';
import type { Feature } from '../../../domain/generated/output.js';
import { AgentRunStatus, PrStatus, SdlcLifecycle } from '../../../domain/generated/output.js';
import type { IFeatureRepository } from '../../ports/output/repositories/feature-repository.interface.js';
import type { IWorktreeService } from '../../ports/output/services/worktree-service.interface.js';
import type { IFeatureAgentProcessService } from '../../ports/output/agents/feature-agent-process.interface.js';
import type { IAgentRunRepository } from '../../ports/output/agents/agent-run-repository.interface.js';
import type { IGitPrService } from '../../ports/output/services/git-pr-service.interface.js';

export interface DeleteFeatureOptions {
  cleanup?: boolean;
  cascadeDelete?: boolean;
  closePr?: boolean;
}

@injectable()
export class DeleteFeatureUseCase {
  constructor(
    @inject('IFeatureRepository') private readonly featureRepo: IFeatureRepository,
    @inject('IWorktreeService') private readonly worktreeService: IWorktreeService,
    @inject('IFeatureAgentProcessService')
    private readonly processService: IFeatureAgentProcessService,
    @inject('IAgentRunRepository') private readonly runRepo: IAgentRunRepository,
    @inject('IGitPrService') private readonly gitPrService: IGitPrService
  ) {}

  async execute(featureId: string, options?: DeleteFeatureOptions): Promise<Feature> {
    // 1. Find feature (exact or prefix match)
    const feature =
      (await this.featureRepo.findById(featureId)) ??
      (await this.featureRepo.findByIdPrefix(featureId));
    if (!feature) {
      throw new Error(`Feature not found: "${featureId}"`);
    }

    const cascadeDelete = options?.cascadeDelete === true;

    // 2. Immediately soft-delete the feature (and children if cascading)
    //    This makes them vanish from all queries right away (no reappear bug)
    if (cascadeDelete) {
      await this.cascadeSoftDelete(feature.id);
    } else {
      // Relocate direct children one level up in the hierarchy
      await this.relocateChildren(feature.id, feature.parentId);
    }
    await this.markDeletingAndSoftDelete(feature);

    // 3. Then perform cleanup (best-effort, feature is already hidden)
    if (cascadeDelete) {
      await this.cascadeCleanupChildren(feature.id, options);
    }
    await this.cleanupSingleFeature(feature, options);

    return feature;
  }

  /** Relocate direct children one level up (set their parentId to the deleted feature's parentId). */
  private async relocateChildren(parentId: string, newParentId?: string): Promise<void> {
    const children = await this.featureRepo.findByParentId(parentId);
    for (const child of children) {
      await this.featureRepo.update({
        ...child,
        parentId: newParentId,
        updatedAt: new Date(),
      });
    }
  }

  /** Recursively soft-delete all children (depth-first). */
  private async cascadeSoftDelete(parentId: string): Promise<void> {
    const children = await this.featureRepo.findByParentId(parentId);
    for (const child of children) {
      await this.cascadeSoftDelete(child.id);
      await this.markDeletingAndSoftDelete(child);
    }
  }

  /** Set lifecycle to Deleting and soft-delete the feature. */
  private async markDeletingAndSoftDelete(feature: Feature): Promise<void> {
    // Update lifecycle to Deleting so it's visible as "deleting" if queried with includeDeleted
    await this.featureRepo.update({
      ...feature,
      lifecycle: SdlcLifecycle.Deleting,
      updatedAt: new Date(),
    });
    // Soft-delete: sets deletedAt, hiding from normal queries
    await this.featureRepo.softDelete(feature.id);
    // Sync the in-memory feature object so subsequent update() calls
    // (e.g. PR status update in cleanup) don't overwrite deleted_at back to null.
    feature.lifecycle = SdlcLifecycle.Deleting;
    feature.deletedAt = new Date();
  }

  /** Recursively cleanup all children (depth-first). */
  private async cascadeCleanupChildren(
    parentId: string,
    options?: DeleteFeatureOptions
  ): Promise<void> {
    // findByParentId includes all children regardless of soft-delete status
    const children = await this.featureRepo.findByParentId(parentId);
    for (const child of children) {
      await this.cascadeCleanupChildren(child.id, options);
      await this.cleanupSingleFeature(child, options);
    }
  }

  /** Cancel agent runs and clean up worktree/branches for a single feature. */
  private async cleanupSingleFeature(
    feature: Feature,
    options?: DeleteFeatureOptions
  ): Promise<void> {
    // Cancel running/pending agent run if present
    if (feature.agentRunId) {
      const run = await this.runRepo.findById(feature.agentRunId);
      if (run && (run.status === AgentRunStatus.running || run.status === AgentRunStatus.pending)) {
        if (run.pid && this.processService.isAlive(run.pid)) {
          try {
            process.kill(run.pid);
          } catch {
            // Process may have already exited
          }
        }
        await this.runRepo.updateStatus(run.id, AgentRunStatus.cancelled);
      }

      // Clean up checkpoint database file (used by LangGraph for state persistence)
      if (run?.threadId) {
        const checkpointPath = join(homedir(), '.shep', 'checkpoints', `${run.threadId}.db`);
        try {
          await unlink(checkpointPath);
        } catch {
          // Checkpoint file may not exist or already be removed
        }
      }
    }

    // Cleanup worktree and branches directly using the feature data we already
    // have (CleanupFeatureWorktreeUseCase.execute() would fail because
    // findById() excludes soft-deleted features).
    const worktreePath =
      feature.worktreePath ??
      this.worktreeService.getWorktreePath(feature.repositoryPath, feature.branch);
    try {
      await this.worktreeService.remove(feature.repositoryPath, worktreePath, true);
    } catch {
      // Worktree might already be removed - that's fine
    }

    const cleanup = options?.cleanup !== false;
    if (cleanup) {
      const shouldDeleteRemote = options?.closePr !== false;

      // Delete local branch, and also remote if closePr is enabled.
      // deleteBranch(cwd, branch, true) deletes local then remote in one call,
      // so we must NOT delete local separately when also deleting remote.
      if (shouldDeleteRemote) {
        let remoteDeleted = false;
        try {
          const remoteExists = await this.worktreeService.remoteBranchExists(
            feature.repositoryPath,
            feature.branch
          );
          if (remoteExists) {
            // Delete local + remote in one call (deleteBranch does local first, then remote)
            await this.gitPrService.deleteBranch(feature.repositoryPath, feature.branch, true);
            remoteDeleted = true;
          } else {
            // No remote branch — just delete local
            await this.gitPrService.deleteBranch(feature.repositoryPath, feature.branch);
          }
        } catch {
          // Branch cleanup is best-effort
        }

        // Update pr.status to Closed after remote branch deletion (GitHub auto-closes the PR)
        if (remoteDeleted && feature.pr?.status === PrStatus.Open) {
          try {
            await this.featureRepo.update({
              ...feature,
              pr: { ...feature.pr, status: PrStatus.Closed },
              updatedAt: new Date(),
            });
          } catch {
            // PR status update is best-effort
          }
        }
      } else {
        // closePr is false — only delete local branch, preserve remote (and the PR)
        try {
          await this.gitPrService.deleteBranch(feature.repositoryPath, feature.branch);
        } catch {
          // Branch might not exist
        }
      }
    }
  }
}
