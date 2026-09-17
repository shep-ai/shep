/**
 * Start Feature Use Case
 *
 * Transitions a Pending feature to its active lifecycle and spawns
 * the agent. Validates lifecycle state, checks the parent dependency
 * gate and the parallel-capacity gate, and reuses the existing AgentRun record.
 *
 * Both gates must be open, and they are evaluated in that order: a feature
 * whose parent has not landed is Blocked and is NOT queued, because queuing it
 * would park a feature that cannot start anyway ahead of one that could.
 *
 * Before the agent is spawned the branch is brought in sync: everything
 * already in the worktree is committed and the branch is rebased onto the
 * latest base branch, so the agent starts from up-to-date code and no
 * pre-existing work is lost. That, and the spawn itself, belong to
 * SpawnFeatureAgentUseCase — the single path from a persisted feature to a
 * running agent.
 */

import { injectable, inject } from 'tsyringe';
import type { Feature, AgentRun } from '../../../domain/generated/output.js';
import { SdlcLifecycle, BuildMode } from '../../../domain/generated/output.js';
import type { IFeatureRepository } from '../../ports/output/repositories/feature-repository.interface.js';
import type { IAgentRunRepository } from '../../ports/output/agents/agent-run-repository.interface.js';
import { satisfiesDependencyGate } from '../../../domain/lifecycle-gates.js';
import { markQueuedForCapacity } from '../../../domain/shared/parallel-feature-limit.js';
import { SpawnFeatureAgentUseCase } from './spawn-feature-agent.use-case.js';
import { FeatureCapacityService } from './capacity/feature-capacity.service.js';

export interface StartFeatureResult {
  feature: Feature;
  agentRun: AgentRun;
  /** True when the dependency gate held the feature back instead of starting it. */
  blocked: boolean;
  /** The parent that holds this feature back, present only when `blocked`. */
  blockedBy?: {
    id: string;
    name: string;
    lifecycle: SdlcLifecycle;
  };
  /** True when the parallel-feature limit held the feature back instead of starting it. */
  queued: boolean;
  /** 1-based place in the queue, present only when `queued`. */
  queuePosition?: number;
}

export interface StartFeatureOptions {
  /**
   * Start the feature even when the parallel-feature limit is reached.
   *
   * This is the user's "start anyway" escape hatch, and it is the only way past
   * the capacity gate. It does NOT bypass the dependency gate: capacity is a
   * resource preference the user may knowingly overspend, whereas starting a
   * feature whose parent has not landed would rebase it onto work that is still
   * being rewritten.
   */
  bypassCapacityLimit?: boolean;
}

@injectable()
export class StartFeatureUseCase {
  constructor(
    @inject('IFeatureRepository')
    private readonly featureRepo: IFeatureRepository,
    @inject('IAgentRunRepository')
    private readonly runRepo: IAgentRunRepository,
    @inject(SpawnFeatureAgentUseCase)
    private readonly spawnFeatureAgent: SpawnFeatureAgentUseCase,
    @inject(FeatureCapacityService)
    private readonly capacity: FeatureCapacityService
  ) {}

  async execute(featureId: string, options?: StartFeatureOptions): Promise<StartFeatureResult> {
    // Resolve feature by exact ID or prefix
    const feature =
      (await this.featureRepo.findById(featureId)) ??
      (await this.featureRepo.findByIdPrefix(featureId));
    if (!feature) {
      throw new Error(`Feature not found: ${featureId}`);
    }

    // Validate lifecycle is Pending
    if (feature.lifecycle !== SdlcLifecycle.Pending) {
      throw new Error(
        `Feature "${feature.name}" is not in Pending state (current: ${feature.lifecycle}). Only pending features can be started.`
      );
    }

    // Validate agentRunId exists
    if (!feature.agentRunId) {
      throw new Error(`No agent run found for feature "${feature.name}"`);
    }

    const agentRun = await this.runRepo.findById(feature.agentRunId);
    if (!agentRun) {
      throw new Error(`No agent run found for feature "${feature.name}"`);
    }

    // Wait for specPath — the web UI creates features in two phases: a fast
    // DB record (specPath: '') followed by background initialization that
    // populates specPath. If the user clicks "Start" before Phase 2 finishes,
    // specPath will still be empty. Poll the DB briefly to let it complete.
    let resolved = feature;
    if (!resolved.specPath) {
      const MAX_POLLS = 20;
      const POLL_INTERVAL_MS = 500;
      for (let i = 0; i < MAX_POLLS; i++) {
        await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
        const refreshed = await this.featureRepo.findById(resolved.id);
        if (refreshed?.specPath) {
          resolved = refreshed;
          break;
        }
      }
      if (!resolved.specPath) {
        throw new Error(
          `Feature "${resolved.name}" is still being initialized — please try again shortly`
        );
      }
    }

    // Gate 1 — dependency. A feature may only start once the work it depends on
    // has landed; otherwise it goes (back) to Blocked and waits for
    // CheckAndUnblockFeaturesUseCase to release it.
    let parent: Feature | null = null;
    let blocked = false;

    if (resolved.parentId) {
      parent = await this.featureRepo.findById(resolved.parentId);
      if (!parent || !satisfiesDependencyGate(parent)) {
        blocked = true;
      }
    }

    if (blocked) {
      const blockedFeature: Feature = {
        ...resolved,
        lifecycle: SdlcLifecycle.Blocked,
        updatedAt: new Date(),
      };
      await this.featureRepo.update(blockedFeature);

      return {
        feature: blockedFeature,
        agentRun,
        blocked: true,
        ...(parent
          ? { blockedBy: { id: parent.id, name: parent.name, lifecycle: parent.lifecycle } }
          : {}),
        queued: false,
      };
    }

    // Gate 2 — capacity. Evaluated only after the dependency gate, so a feature
    // that cannot run yet never takes a place in the queue ahead of one that can.
    if (options?.bypassCapacityLimit !== true && !(await this.capacity.hasCapacity())) {
      const queuedFeature = markQueuedForCapacity(resolved);
      await this.featureRepo.update(queuedFeature);

      return {
        feature: queuedFeature,
        agentRun,
        blocked: false,
        queued: true,
        queuePosition: await this.capacity.getQueuePosition(queuedFeature.id),
      };
    }

    // Both gates open — transition and start.
    const updatedFeature: Feature = {
      ...resolved,
      lifecycle:
        resolved.fast === true || resolved.buildMode === BuildMode.Fast
          ? SdlcLifecycle.Implementation
          : SdlcLifecycle.Requirements,
      updatedAt: new Date(),
    };
    delete updatedFeature.queuedAt;
    await this.featureRepo.update(updatedFeature);

    await this.spawnFeatureAgent.execute({
      feature: updatedFeature,
      ...(parent ? { parentBranch: parent.branch } : {}),
    });

    return {
      feature: updatedFeature,
      agentRun,
      blocked: false,
      queued: false,
    };
  }
}
