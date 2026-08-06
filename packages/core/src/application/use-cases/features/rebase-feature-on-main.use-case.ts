/**
 * Rebase Feature on Main Use Case
 *
 * User-facing wrapper around {@link SyncFeatureBranchUseCase}: records the
 * rebase in the activity timeline (agent run + phase timing) and delegates
 * the commit-then-rebase workflow.
 *
 * Flow: resolve feature → create standalone agent run → record phase timing →
 * sync feature branch (auto-commit → sync base → rebase → resolve conflicts) →
 * complete timing.
 */

import { injectable, inject } from 'tsyringe';
import { randomUUID } from 'node:crypto';
import type { IFeatureRepository } from '../../ports/output/repositories/feature-repository.interface.js';
import type { IAgentRunRepository } from '../../ports/output/agents/agent-run-repository.interface.js';
import type { IPhaseTimingRepository } from '../../ports/output/agents/phase-timing-repository.interface.js';
import { AgentRunStatus, AgentType } from '../../../domain/generated/output.js';
import { SyncFeatureBranchUseCase } from './sync-feature-branch.use-case.js';

@injectable()
export class RebaseFeatureOnMainUseCase {
  constructor(
    @inject('IFeatureRepository')
    private readonly featureRepo: IFeatureRepository,
    private readonly syncFeatureBranch: SyncFeatureBranchUseCase,
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
      // Commit any work in progress, refresh the base branch, then rebase.
      await this.syncFeatureBranch.execute({
        repositoryPath: feature.repositoryPath,
        branch: feature.branch,
      });

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
}
