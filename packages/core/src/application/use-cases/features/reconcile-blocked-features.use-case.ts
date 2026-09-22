/**
 * ReconcileBlockedFeaturesUseCase
 *
 * Self-healing sweep that restores the dependency-gate invariant:
 *
 *   A feature MUST NOT remain Blocked once its parent has passed the
 *   Implementation gate.
 *
 * CheckAndUnblockFeaturesUseCase only fires as a side effect of a parent
 * lifecycle *transition*. Any write that reaches the feature record without
 * going through UpdateFeatureLifecycleUseCase — and any dependency edge added
 * to a parent that has already finished — leaves the child stranded in Blocked
 * with no future transition left to release it.
 *
 * This use case closes that gap from the state side rather than the event side:
 * it groups stranded children by parent and hands each parent to
 * CheckAndUnblockFeaturesUseCase, which owns the gate and the
 * Blocked -> Started + rebase + spawn flow. No gate logic is duplicated here.
 *
 * Idempotent and cheap when the invariant already holds (one indexed query),
 * so it is safe to call on every dashboard load.
 *
 * It also explains the children it cannot release. A parent whose agent run
 * failed or was interrupted never reaches the gate by itself, so its children
 * stay Blocked — correctly — but used to do so silently. Each such child gets
 * one `blocked-on-parent` entry in its activity timeline naming the parent and
 * why its run stopped. The gate itself is unchanged.
 */

import { injectable, inject } from 'tsyringe';
import { randomUUID } from 'node:crypto';
import { AgentRunStatus, SdlcLifecycle } from '../../../domain/generated/output.js';
import type { AgentRun, Feature } from '../../../domain/generated/output.js';
import type { IFeatureRepository } from '../../ports/output/repositories/feature-repository.interface.js';
import type { IAgentRunRepository } from '../../ports/output/agents/agent-run-repository.interface.js';
import type { IPhaseTimingRepository } from '../../ports/output/agents/phase-timing-repository.interface.js';
import type { ILogger } from '../../ports/output/services/logger.interface.js';
import { TERMINAL_AGENT_RUN_STATUSES } from '../../../domain/shared/agent-run-status.js';
import { CheckAndUnblockFeaturesUseCase } from './check-and-unblock-features.use-case.js';

/** Activity-timeline phase explaining why a child is still Blocked. */
export const BLOCKED_ON_PARENT_PHASE = 'blocked-on-parent';

/** Exit code the timeline renders as a failure. */
const TIMELINE_ERROR_EXIT_CODE = 'error';

/**
 * Parent run outcomes that stop the parent from ever reaching the gate on its
 * own: somebody has to resume, restart or fix the parent.
 */
const STALLED_PARENT_RUN_STATUSES: ReadonlySet<AgentRunStatus> = new Set(
  [...TERMINAL_AGENT_RUN_STATUSES].filter((status) => status !== AgentRunStatus.completed)
);

function blockedOnParentMessage(parent: Feature, run: AgentRun): string {
  const cause = run.error ? `: ${run.error}` : '';
  return (
    `Still blocked: parent feature "${parent.name}" stopped — its agent run ` +
    `${run.status}${cause}. Resume or restart the parent to release this feature.`
  );
}

export interface ReconcileBlockedFeaturesOutput {
  /** IDs of the features released from Blocked by this sweep. */
  unblockedFeatureIds: string[];
}

@injectable()
export class ReconcileBlockedFeaturesUseCase {
  constructor(
    @inject('IFeatureRepository')
    private readonly featureRepo: IFeatureRepository,
    @inject(CheckAndUnblockFeaturesUseCase)
    private readonly checkAndUnblock: CheckAndUnblockFeaturesUseCase,
    @inject('IAgentRunRepository')
    private readonly agentRunRepo: IAgentRunRepository,
    @inject('IPhaseTimingRepository')
    private readonly phaseTimingRepo: IPhaseTimingRepository,
    @inject('ILogger')
    private readonly logger: ILogger
  ) {}

  async execute(): Promise<ReconcileBlockedFeaturesOutput> {
    const blocked = await this.featureRepo.list({ lifecycle: SdlcLifecycle.Blocked });

    // One evaluation per distinct parent — CheckAndUnblock already sweeps all of
    // a parent's blocked children in a single call.
    const parentIds = new Set(
      blocked.map((feature) => feature.parentId).filter((id): id is string => !!id)
    );

    const unblockedFeatureIds = new Set<string>();

    for (const parentId of parentIds) {
      try {
        const unblocked = await this.checkAndUnblock.execute(parentId);
        for (const id of unblocked) {
          unblockedFeatureIds.add(id);
        }
      } catch (error) {
        // Isolate per parent — a failed rebase or spawn for one dependency chain
        // must not strand the others for another whole sweep cycle. Logged, so
        // a chain that fails on every sweep is visible rather than silent.
        this.logger.warn('Blocked-feature reconcile failed for parent', {
          parentId,
          error: error instanceof Error ? error.message : String(error),
        });
      }

      const stillBlocked = blocked.filter(
        (child) => child.parentId === parentId && !unblockedFeatureIds.has(child.id)
      );
      await this.explainStalledParent(parentId, stillBlocked);
    }

    return { unblockedFeatureIds: [...unblockedFeatureIds] };
  }

  /**
   * Record, once per child and parent run, that the child waits on a parent
   * whose agent stopped. Best-effort and isolated: an explanation must never
   * stop the sweep.
   */
  private async explainStalledParent(parentId: string, children: Feature[]): Promise<void> {
    if (children.length === 0) return;
    try {
      const parent = await this.featureRepo.findById(parentId);
      if (!parent?.agentRunId) return;
      const run = await this.agentRunRepo.findById(parent.agentRunId);
      if (!run || !STALLED_PARENT_RUN_STATUSES.has(run.status)) return;

      const reason = blockedOnParentMessage(parent, run);
      for (const child of children) {
        await this.recordBlockedReason(child, reason);
      }
    } catch (error) {
      this.logger.warn('Could not record why blocked features are waiting', {
        parentId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private async recordBlockedReason(child: Feature, reason: string): Promise<void> {
    if (!child.agentRunId) return;
    const existing = await this.phaseTimingRepo.findByRunId(child.agentRunId);
    if (existing.some((t) => t.phase === BLOCKED_ON_PARENT_PHASE && t.errorMessage === reason)) {
      return;
    }
    const now = new Date().toISOString();
    await this.phaseTimingRepo.save({
      id: randomUUID(),
      agentRunId: child.agentRunId,
      phase: BLOCKED_ON_PARENT_PHASE,
      startedAt: now,
      completedAt: now,
      exitCode: TIMELINE_ERROR_EXIT_CODE,
      errorMessage: reason,
      createdAt: now,
      updatedAt: now,
    });
  }
}
