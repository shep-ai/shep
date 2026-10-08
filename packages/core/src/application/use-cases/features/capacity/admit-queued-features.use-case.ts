/**
 * AdmitQueuedFeaturesUseCase
 *
 * Drains the parallel-capacity queue: while slots remain, take the
 * longest-waiting queued feature, clear its queue marker, move it into its
 * target lifecycle, and start its agent.
 *
 * This is the capacity twin of CheckAndUnblockFeaturesUseCase, and it is
 * deliberately shaped the same way, because the two gates are independent and a
 * feature must pass BOTH:
 *
 *   - the dependency gate asks "has the work I build on landed?"
 *   - the capacity gate asks "is there a machine slot for me?"
 *
 * A queued feature whose parent has not landed stays queued and does not consume
 * the slot — the next feature in line takes it instead. Evaluating capacity for
 * a feature that cannot start anyway would strand a free slot behind a blocked
 * one.
 *
 * Called from every event that can free a slot or raise the ceiling:
 * lifecycle transitions, settings updates, feature deletion, and a state-side
 * sweep on dashboard load. Nothing in this path can stop a running agent — the
 * cap governs admission only.
 */

import { injectable, inject } from 'tsyringe';
import type { Feature } from '../../../../domain/generated/output.js';
import { SdlcLifecycle, BuildMode } from '../../../../domain/generated/output.js';
import type { IFeatureRepository } from '../../../ports/output/repositories/feature-repository.interface.js';
import { satisfiesDependencyGate } from '../../../../domain/lifecycle-gates.js';
import { UNLIMITED_PARALLEL_FEATURES } from '../../../../domain/shared/parallel-feature-limit.js';
import { SpawnFeatureAgentUseCase } from '../spawn-feature-agent.use-case.js';
import { FeatureCapacityService } from './feature-capacity.service.js';

export interface AdmitQueuedFeaturesResult {
  /** IDs of the features started by this drain, in admission order. */
  admittedFeatureIds: string[];
}

@injectable()
export class AdmitQueuedFeaturesUseCase {
  constructor(
    @inject('IFeatureRepository')
    private readonly featureRepo: IFeatureRepository,
    @inject(FeatureCapacityService)
    private readonly capacity: FeatureCapacityService,
    @inject(SpawnFeatureAgentUseCase)
    private readonly spawnFeatureAgent: SpawnFeatureAgentUseCase
  ) {}

  async execute(): Promise<AdmitQueuedFeaturesResult> {
    const queued = await this.featureRepo.listQueued();
    if (queued.length === 0) {
      return { admittedFeatureIds: [] };
    }

    // A parked fleet admits nothing, however much room the ceiling has. Checked
    // before the limit because the paused limit is 0, which means UNLIMITED
    // everywhere else — reading only the number would drain the whole queue.
    // Queued features keep their `queuedAt` place; a pause parks work, it does
    // not discard it.
    if (await this.capacity.isPaused()) {
      return { admittedFeatureIds: [] };
    }

    const limit = await this.capacity.getLimit();
    const unlimited = limit === UNLIMITED_PARALLEL_FEATURES;

    // Read the running count once and track admissions locally. Re-querying per
    // feature would race with the agents this loop is starting: a spawned agent
    // may not have written its first lifecycle update yet, so the count would
    // still read low and the loop would over-admit.
    let running = unlimited ? 0 : await this.capacity.getRunningCount();

    const admittedFeatureIds: string[] = [];

    for (const feature of queued) {
      if (!unlimited && running >= limit) {
        break;
      }

      const gateOpen = await this.isDependencyGateOpen(feature);
      if (!gateOpen) {
        // Stays queued, keeps its place, and does not consume the slot.
        continue;
      }

      try {
        const admitted = await this.admit(feature);
        if (admitted) {
          admittedFeatureIds.push(feature.id);
          running += 1;
        }
      } catch {
        // Isolate per feature — one failed spawn must not strand the rest of
        // the queue until the next trigger fires.
      }
    }

    return { admittedFeatureIds };
  }

  /**
   * Is the feature's parent dependency satisfied?
   *
   * A feature with no parent is always open. A parent that cannot be resolved
   * is treated as closed rather than as absent: a dangling parentId means the
   * work this feature builds on is unaccounted for, and starting anyway would
   * rebase it onto nothing.
   */
  private async isDependencyGateOpen(feature: Feature): Promise<boolean> {
    if (!feature.parentId) {
      return true;
    }
    const parent = await this.featureRepo.findById(feature.parentId);
    return parent !== null && satisfiesDependencyGate(parent);
  }

  /**
   * Claim the queue slot, transition the feature, and start its agent.
   *
   * The claim is what makes this safe to run in several processes at once. The
   * daemon sweep, a dashboard load and a worker finishing a feature all trigger
   * a drain, and all three can see the same queued feature; an unconditional
   * update followed by a spawn would give that ONE feature TWO detached
   * workers in ONE git worktree, sharing an agent run and a log file, doing
   * concurrent git operations on one branch — and would quietly exceed the cap.
   *
   * The claim also clears the queue marker BEFORE the spawn, so a spawn failure
   * cannot leave the feature both queued and running: a feature that fails to
   * spawn surfaces as a failed agent run the user can see and retry, rather
   * than silently re-entering the queue on the next sweep.
   */
  private async admit(feature: Feature): Promise<boolean> {
    const targetLifecycle = this.targetLifecycle(feature);
    const now = new Date();

    const claimed = await this.capacity.claimSlot({
      featureId: feature.id,
      targetLifecycle,
      // Losing this condition is the whole defect: whoever clears `queuedAt`
      // first owns the spawn, and everyone else gets `false` and moves on.
      requireQueued: true,
      now,
    });
    if (!claimed) {
      return false;
    }

    const parent = feature.parentId ? await this.featureRepo.findById(feature.parentId) : null;

    const admitted: Feature = {
      ...feature,
      lifecycle: targetLifecycle,
      updatedAt: now,
    };
    delete admitted.queuedAt;

    const result = await this.spawnFeatureAgent.execute({
      feature: admitted,
      ...(parent ? { parentBranch: parent.branch } : {}),
    });

    return result.spawned;
  }

  /**
   * Where an admitted feature resumes.
   *
   * Mirrors StartFeatureUseCase: fast and exploration builds skip straight to
   * the phase they actually run, everything else enters the SDLC at
   * Requirements.
   */
  private targetLifecycle(feature: Feature): SdlcLifecycle {
    if (feature.buildMode === BuildMode.Exploration) {
      return SdlcLifecycle.Exploring;
    }
    if (feature.fast === true || feature.buildMode === BuildMode.Fast) {
      return SdlcLifecycle.Implementation;
    }
    return SdlcLifecycle.Requirements;
  }
}
