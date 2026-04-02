/**
 * CheckAndUnblockFeaturesUseCase
 *
 * Evaluates whether blocked direct children of a parent feature are now
 * eligible to start, and if so transitions them to Started and spawns their
 * agents.
 *
 * Business Rules:
 * - Only direct children of parentFeatureId are evaluated (no recursive traversal).
 *   Grandchildren stay Blocked until their own direct parent progresses.
 * - Gate: parent lifecycle must be in POST_IMPLEMENTATION (Implementation, Review, Maintain).
 * - Idempotent: already-Started children are not touched; calling execute() twice is safe.
 * - spawn() is skipped for children missing agentRunId or specPath (defensive guard).
 *
 * Called from: UpdateFeatureLifecycleUseCase after every lifecycle transition.
 */

import { injectable, inject } from 'tsyringe';
import { SdlcLifecycle, FeatureMode } from '../../../domain/generated/output.js';
import type { IFeatureRepository } from '../../ports/output/repositories/feature-repository.interface.js';
import type { IFeatureAgentProcessService } from '../../ports/output/agents/feature-agent-process.interface.js';
import { POST_IMPLEMENTATION } from '../../../domain/lifecycle-gates.js';

@injectable()
export class CheckAndUnblockFeaturesUseCase {
  constructor(
    @inject('IFeatureRepository') private readonly featureRepo: IFeatureRepository,
    @inject('IFeatureAgentProcessService')
    private readonly agentProcess: IFeatureAgentProcessService
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
            ...(child.mode !== FeatureMode.Regular ? { mode: child.mode } : {}),
          }
        );
      }
    }
  }
}
