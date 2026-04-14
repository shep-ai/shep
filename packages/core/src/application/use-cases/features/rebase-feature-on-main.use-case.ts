/**
 * Rebase Feature on Main Use Case
 *
 * Rebases a feature branch onto the latest main branch with auto-sync
 * and agent-powered conflict resolution.
 *
 * Flow: resolve feature → create standalone agent run → record phase timing →
 * determine cwd (worktree or repo root) → sync main → rebase →
 * on conflict, delegate to ConflictResolutionService → complete timing.
 */

import { injectable, inject } from 'tsyringe';
import { randomUUID } from 'node:crypto';
import type { IFeatureRepository } from '../../ports/output/repositories/feature-repository.interface.js';
import type { IGitPrService } from '../../ports/output/services/git-pr-service.interface.js';
import {
  GitPrError,
  GitPrErrorCode,
} from '../../ports/output/services/git-pr-service.interface.js';
import type { IWorktreeService } from '../../ports/output/services/worktree-service.interface.js';
import type { IAgentRunRepository } from '../../ports/output/agents/agent-run-repository.interface.js';
import type { IPhaseTimingRepository } from '../../ports/output/agents/phase-timing-repository.interface.js';
import { AgentRunStatus, AgentType } from '../../../domain/generated/output.js';
import type { IConflictResolutionService } from '../../ports/output/services/conflict-resolution.interface.js';

@injectable()
export class RebaseFeatureOnMainUseCase {
  constructor(
    @inject('IFeatureRepository')
    private readonly featureRepo: IFeatureRepository,
    @inject('IGitPrService')
    private readonly gitPrService: IGitPrService,
    @inject('IWorktreeService')
    private readonly worktreeService: IWorktreeService,
    @inject('IConflictResolutionService')
    private readonly conflictResolutionService: IConflictResolutionService,
    @inject('IAgentRunRepository')
    private readonly agentRunRepo: IAgentRunRepository,
    @inject('IPhaseTimingRepository')
    private readonly phaseTimingRepo: IPhaseTimingRepository
  ) {}

  async execute(featureId: string): Promise<void> {
    // Resolve feature by exact ID or prefix
    const feature =
      (await this.featureRepo.findById(featureId)) ??
      (await this.featureRepo.findByIdPrefix(featureId));
    if (!feature) {
      throw new Error(`Feature not found: "${featureId}"`);
    }

    // Create standalone agent run + phase timing for activity timeline
    const now = new Date().toISOString();
    const agentRunId = randomUUID();
    const phaseTimingId = randomUUID();

    await this.agentRunRepo.create({
      id: agentRunId,
      agentType: AgentType.ClaudeCode,
      agentName: 'rebase',
      status: AgentRunStatus.running,
      prompt: `Rebase ${feature.branch} on main`,
      threadId: agentRunId,
      startedAt: now,
      featureId: feature.id,
      repositoryPath: feature.repositoryPath,
      createdAt: now,
      updatedAt: now,
    });

    await this.phaseTimingRepo.save({
      id: phaseTimingId,
      agentRunId,
      phase: 'rebase',
      startedAt: now,
      createdAt: now,
      updatedAt: now,
    });

    const startMs = Date.now();

    try {
      // Determine working directory — worktree path if it exists, else repo root
      const cwd = await this.resolveCwd(feature.repositoryPath, feature.branch);
      const defaultBranch = await this.gitPrService.getDefaultBranch(feature.repositoryPath);

      // Stash uncommitted changes if present (smart rebase)
      const didStash = await this.gitPrService.stash(cwd, `shep-auto-stash: ${feature.branch}`);
      let stashPopError: Error | undefined;

      try {
        // Auto-sync main before rebasing (per spec decision)
        await this.gitPrService.syncMain(cwd, defaultBranch);

        // Attempt rebase
        try {
          await this.gitPrService.rebaseOnMain(cwd, feature.branch, defaultBranch);
        } catch (error) {
          if (error instanceof GitPrError && error.code === GitPrErrorCode.REBASE_CONFLICT) {
            // Delegate to agent-powered conflict resolution
            await this.conflictResolutionService.resolve(cwd, feature.branch, defaultBranch);
          } else {
            throw error;
          }
        }
      } finally {
        // Restore stashed changes after rebase (whether it succeeded or failed)
        if (didStash) {
          try {
            await this.gitPrService.stashPop(cwd);
          } catch {
            // Stash pop failed — likely conflicts between rebased code and stashed changes.
            // Invoke agent-powered resolution, then drop the stash entry on success.
            try {
              await this.conflictResolutionService.resolveStashPop(
                cwd,
                feature.branch,
                defaultBranch
              );
              await this.gitPrService.stashDrop(cwd);
            } catch {
              stashPopError = new Error(
                `Rebase succeeded but failed to restore your uncommitted changes. ` +
                  `The rebase is complete, but your stashed work-in-progress could not be applied cleanly. ` +
                  `Run \`git stash pop\` manually to resolve the remaining conflicts. ` +
                  `Your stash entry is preserved.`
              );
            }
          }
        }
      }

      // Throw stash pop error after the finally block to satisfy no-unsafe-finally
      if (stashPopError) {
        throw stashPopError;
      }

      // Rebase succeeded (possibly with resolved conflicts)
      await this.completeTiming(agentRunId, phaseTimingId, startMs, 'success');
    } catch (error) {
      // Record failure in timing
      const message = error instanceof Error ? error.message : String(error);
      await this.completeTiming(agentRunId, phaseTimingId, startMs, 'error', message);
      throw error;
    }
  }

  private async completeTiming(
    agentRunId: string,
    phaseTimingId: string,
    startMs: number,
    exitCode: 'success' | 'error',
    errorMessage?: string
  ): Promise<void> {
    const completedAt = new Date().toISOString();
    const durationMs = Date.now() - startMs;

    await this.phaseTimingRepo.update(phaseTimingId, {
      completedAt,
      durationMs: BigInt(durationMs),
      exitCode,
      ...(errorMessage && { errorMessage }),
    });

    await this.agentRunRepo.updateStatus(
      agentRunId,
      exitCode === 'success' ? AgentRunStatus.completed : AgentRunStatus.failed,
      { completedAt, ...(errorMessage && { error: errorMessage }) }
    );
  }

  /**
   * Resolve the correct working directory for the feature.
   * Uses the worktree path if a worktree exists for this branch,
   * otherwise falls back to the repository root.
   */
  private async resolveCwd(repositoryPath: string, branch: string): Promise<string> {
    const hasWorktree = await this.worktreeService.exists(repositoryPath, branch);
    if (hasWorktree) {
      return this.worktreeService.getWorktreePath(repositoryPath, branch);
    }
    return repositoryPath;
  }
}
