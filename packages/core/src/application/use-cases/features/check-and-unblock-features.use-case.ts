/**
 * CheckAndUnblockFeaturesUseCase
 *
 * Evaluates whether blocked direct children of a parent feature are now
 * eligible to start, and if so transitions them to Started, rebases their
 * branches onto the parent branch, and spawns their agents.
 *
 * Business Rules:
 * - Only direct children of parentFeatureId are evaluated (no recursive traversal).
 *   Grandchildren stay Blocked until their own direct parent progresses.
 * - Gate: parent lifecycle must be in POST_IMPLEMENTATION (Implementation, Review, Maintain).
 * - Idempotent: already-Started children are not touched; calling execute() twice is safe.
 * - spawn() is skipped for children missing agentRunId or specPath (defensive guard).
 * - Auto-rebase: each blocked child's branch is rebased onto the parent branch
 *   before spawning the agent. Rebase failures are isolated per-child and recorded
 *   in the activity timeline. Agent spawns regardless of rebase outcome.
 * - NFR-3: rebase is skipped if the child has an active (running) agent run.
 *
 * Called from: UpdateFeatureLifecycleUseCase after every lifecycle transition.
 */

import { injectable, inject } from 'tsyringe';
import { randomUUID } from 'node:crypto';
import {
  SdlcLifecycle,
  BuildMode,
  AgentRunStatus,
  AgentType,
} from '../../../domain/generated/output.js';
import type { Feature } from '../../../domain/generated/output.js';
import type { IFeatureRepository } from '../../ports/output/repositories/feature-repository.interface.js';
import type { IFeatureAgentProcessService } from '../../ports/output/agents/feature-agent-process.interface.js';
import type { ISettingsRepository } from '../../ports/output/repositories/settings.repository.interface.js';
import type { IGitPrService } from '../../ports/output/services/git-pr-service.interface.js';
import {
  GitPrError,
  GitPrErrorCode,
} from '../../ports/output/services/git-pr-service.interface.js';
import type { IWorktreeService } from '../../ports/output/services/worktree-service.interface.js';
import type { IConflictResolutionService } from '../../ports/output/services/conflict-resolution.interface.js';
import type { IAgentRunRepository } from '../../ports/output/agents/agent-run-repository.interface.js';
import type { IPhaseTimingRepository } from '../../ports/output/agents/phase-timing-repository.interface.js';
import { POST_IMPLEMENTATION } from '../../../domain/lifecycle-gates.js';

/** Maximum time (ms) to wait for a single child rebase before aborting. */
const REBASE_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

@injectable()
export class CheckAndUnblockFeaturesUseCase {
  constructor(
    @inject('IFeatureRepository') private readonly featureRepo: IFeatureRepository,
    @inject('IFeatureAgentProcessService')
    private readonly agentProcess: IFeatureAgentProcessService,
    @inject('ISettingsRepository')
    private readonly settingsRepository: ISettingsRepository,
    @inject('IGitPrService')
    private readonly gitPrService: IGitPrService,
    @inject('IWorktreeService')
    private readonly worktreeService: IWorktreeService,
    @inject('ConflictResolutionService')
    private readonly conflictResolutionService: IConflictResolutionService,
    @inject('IAgentRunRepository')
    private readonly agentRunRepo: IAgentRunRepository,
    @inject('IPhaseTimingRepository')
    private readonly phaseTimingRepo: IPhaseTimingRepository
  ) {}

  /**
   * Check and unblock direct children of the given parent feature.
   *
   * @param parentFeatureId - ID of the feature whose children should be evaluated.
   */
  async execute(parentFeatureId: string): Promise<void> {
    // Load parent and verify gate
    const parent = await this.featureRepo.findById(parentFeatureId);
    if (!parent || !POST_IMPLEMENTATION.has(parent.lifecycle)) {
      return;
    }

    // Load direct children
    const children = await this.featureRepo.findByParentId(parentFeatureId);

    // Unblock each blocked child
    for (const child of children) {
      if (child.lifecycle !== SdlcLifecycle.Blocked) {
        continue;
      }

      // Transition to Started
      child.lifecycle = SdlcLifecycle.Started;
      child.updatedAt = new Date();
      await this.featureRepo.update(child);

      // Rebase child branch onto parent branch (isolated per-child)
      await this.rebaseChildOntoParent(child, parent);

      // Spawn agent using fields set at feature creation time
      if (child.agentRunId && child.specPath) {
        this.agentProcess.spawn(
          child.id,
          child.agentRunId,
          child.repositoryPath,
          child.specPath,
          child.worktreePath,
          {
            approvalGates: child.approvalGates,
            push: child.push,
            openPr: child.openPr,
            forkAndPr: child.forkAndPr,
            commitSpecs: child.commitSpecs,
            ciWatchEnabled: child.ciWatchEnabled,
            enableEvidence: child.enableEvidence,
            commitEvidence: child.commitEvidence,
            ...(child.fast ? { fast: true } : {}),
            securityMode: (await this.settingsRepository.load())?.security?.mode,
            ...(child.buildMode === BuildMode.Exploration ? { exploration: true } : {}),
          }
        );
      }
    }
  }

  /**
   * Rebase a child feature branch onto the parent feature branch.
   *
   * Creates an agent run + phase timing for activity timeline tracking.
   * Stashes uncommitted changes before rebase and restores in finally block.
   * Delegates to ConflictResolutionService on conflicts.
   * Failures are recorded but do not prevent agent spawn.
   *
   * Skips rebase if the child has an active (running) agent run (NFR-3).
   */
  private async rebaseChildOntoParent(child: Feature, parent: Feature): Promise<void> {
    // NFR-3: skip rebase if child has an active agent run
    if (child.agentRunId) {
      const existingRun = await this.agentRunRepo.findById(child.agentRunId);
      if (existingRun && existingRun.status === AgentRunStatus.running) {
        return;
      }
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
      prompt: `Rebase ${child.branch} onto parent ${parent.branch}`,
      threadId: agentRunId,
      startedAt: now,
      featureId: child.id,
      repositoryPath: child.repositoryPath,
      createdAt: now,
      updatedAt: now,
    });

    await this.phaseTimingRepo.save({
      id: phaseTimingId,
      agentRunId,
      phase: 'rebase-on-parent',
      startedAt: now,
      createdAt: now,
      updatedAt: now,
    });

    const startMs = Date.now();

    try {
      // Resolve CWD — worktree path if it exists, else repo root
      const cwd = await this.resolveCwd(child.repositoryPath, child.branch);

      // Stash uncommitted changes (smart rebase)
      const didStash = await this.gitPrService.stash(
        cwd,
        'shep-rebase: auto-stash before parent rebase'
      );

      try {
        // Rebase child branch onto parent branch (with timeout)
        await Promise.race([
          this.performRebase(cwd, child.branch, parent.branch),
          this.createTimeout(REBASE_TIMEOUT_MS, child.branch),
        ]);
      } finally {
        // Restore stashed changes (regardless of rebase outcome)
        if (didStash) {
          await this.gitPrService.stashPop(cwd);
        }
      }

      // Rebase succeeded
      await this.completeTiming(agentRunId, phaseTimingId, startMs, 'success');
    } catch (error) {
      // Record failure in activity timeline but do not throw —
      // agent spawn proceeds regardless of rebase outcome
      const message = error instanceof Error ? error.message : String(error);
      await this.completeTiming(agentRunId, phaseTimingId, startMs, 'error', message);
    }
  }

  /**
   * Perform the rebase with conflict resolution.
   */
  private async performRebase(
    cwd: string,
    childBranch: string,
    parentBranch: string
  ): Promise<void> {
    try {
      await this.gitPrService.rebaseOnBranch(cwd, childBranch, parentBranch);
    } catch (error) {
      if (error instanceof GitPrError && error.code === GitPrErrorCode.REBASE_CONFLICT) {
        // Delegate to agent-powered conflict resolution
        await this.conflictResolutionService.resolve(cwd, childBranch, parentBranch);
      } else {
        throw error;
      }
    }
  }

  /**
   * Create a timeout promise that rejects after the specified duration.
   */
  private createTimeout(ms: number, childBranch: string): Promise<never> {
    return new Promise((_, reject) => {
      setTimeout(() => reject(new Error(`Rebase timeout: ${childBranch} exceeded ${ms}ms`)), ms);
    });
  }

  /**
   * Complete the phase timing and update agent run status.
   */
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
   * Resolve the correct working directory for the child feature.
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
