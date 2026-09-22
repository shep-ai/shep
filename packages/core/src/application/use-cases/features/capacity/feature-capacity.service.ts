/**
 * FeatureCapacityService
 *
 * Answers "how many features are running, and may another one start?" for every
 * caller that needs it — admission on create and manual start, the queue drain,
 * and the read models the web/CLI/TUI render.
 *
 * The running count is DERIVED from lifecycle and the feature's current agent
 * run on every call rather than tracked
 * in a counter. A counter would be cheaper and would be wrong: a crashed worker,
 * a force-deleted feature, or any write that bypasses the transition use case
 * leaks a slot permanently, and the only symptom is a queue that never drains.
 * A derived count repairs itself the moment the underlying row changes.
 *
 * The rule itself (which lifecycles count, what 0 means, what a valid limit is)
 * lives in domain/shared/parallel-feature-limit.ts — this service supplies the
 * I/O around it and owns none of the semantics.
 */

import { injectable, inject } from 'tsyringe';
import type { IFeatureRepository } from '../../../ports/output/repositories/feature-repository.interface.js';
import type { ISettingsRepository } from '../../../ports/output/repositories/settings.repository.interface.js';
import type { SdlcLifecycle } from '../../../../domain/generated/output.js';
import {
  RUNNING_LIFECYCLES,
  SLOT_RELEASING_RUN_STATUSES,
  UNLIMITED_PARALLEL_FEATURES,
  hasCapacity,
  resolveMaxParallelFeatures,
} from '../../../../domain/shared/parallel-feature-limit.js';

/** A feature waiting for a slot, with its 1-based place in the queue. */
export interface QueuedFeaturePosition {
  featureId: string;
  /** 1-based: the next feature to be admitted is position 1. */
  position: number;
  queuedAt: Date;
}

/** What a caller must still be true when it takes a slot. */
export interface ClaimSlotInput {
  /** The feature taking the slot. */
  featureId: string;
  /** Lifecycle the feature moves to when the claim is won. */
  targetLifecycle: SdlcLifecycle;
  /** Require the feature to still be waiting in the capacity queue. */
  requireQueued?: boolean;
  /** Require the feature to still be in this lifecycle. */
  requireLifecycle?: SdlcLifecycle;
  /** Require the feature to still point at this agent run (see FeatureStartClaim). */
  requireAgentRunId?: string;
  /** Point the feature at this agent run as part of the claim (see FeatureStartClaim). */
  agentRunId?: string;
  /**
   * The user's explicit "start anyway". Skips the cap — and ONLY the cap: the
   * queue and lifecycle conditions still hold, because they are about whether
   * this feature is still the caller's to start, not about resource budget.
   */
  bypassLimit?: boolean;
  /** Stamp written to `updatedAt`. Defaults to now. */
  now?: Date;
}

export interface ParallelCapacitySnapshot {
  /** Configured limit; 0 means unlimited. */
  limit: number;
  /** True when no cap is configured. */
  unlimited: boolean;
  /** Features currently holding a slot. */
  running: number;
  /**
   * How many more features may start right now, or null when unlimited.
   * Never negative — lowering the limit below the running count reports 0
   * rather than a negative deficit, because nothing gets stopped to make room.
   */
  available: number | null;
  /** Features waiting for a slot, in admission order. */
  queue: QueuedFeaturePosition[];
}

@injectable()
export class FeatureCapacityService {
  constructor(
    @inject('IFeatureRepository')
    private readonly featureRepo: IFeatureRepository,
    @inject('ISettingsRepository')
    private readonly settingsRepository: ISettingsRepository
  ) {}

  /** The configured limit, clamped. 0 means unlimited. */
  async getLimit(): Promise<number> {
    return resolveMaxParallelFeatures(await this.settingsRepository.load());
  }

  /** Features currently holding a slot. */
  async getRunningCount(): Promise<number> {
    return this.featureRepo.countByLifecycles([...RUNNING_LIFECYCLES], {
      releasingRunStatuses: [...SLOT_RELEASING_RUN_STATUSES],
    });
  }

  /**
   * May one more feature start right now?
   *
   * An ADVISORY answer, and only ever that: it is read in one statement and
   * acted on in another, so by the time the caller writes, another process may
   * have taken the last slot. Use it to decide what to TELL the user (or which
   * lifecycle to give a feature that is not being started); use
   * {@link claimSlot} to actually take the slot.
   *
   * Deliberately cheaper than `snapshot()` — it skips the queue query, because
   * the admission path is on the critical path of starting a feature and does
   * not care who else is waiting.
   */
  async hasCapacity(): Promise<boolean> {
    const limit = await this.getLimit();
    if (limit === UNLIMITED_PARALLEL_FEATURES) {
      return true;
    }
    return hasCapacity(await this.getRunningCount(), limit);
  }

  /**
   * Take a slot for this feature, atomically.
   *
   * This is the ONLY safe gate in front of a spawn. `hasCapacity()` answers in
   * one transaction and the caller writes in another, so two `shep start`
   * invocations could both see 2 running against a limit of 3 and both start;
   * likewise two queue drains could both admit the same feature and put two
   * detached workers in one git worktree. Here the count is derived INSIDE the
   * statement that performs the write it authorises.
   *
   * Deriving the count rather than keeping a counter is still deliberate — see
   * this class's header — and is unchanged: the fix is where the derivation
   * happens, not how.
   *
   * @param input - The feature, its target lifecycle, and what must still hold
   * @returns True when this call took the slot and may spawn
   */
  async claimSlot(input: ClaimSlotInput): Promise<boolean> {
    const limit = input.bypassLimit === true ? UNLIMITED_PARALLEL_FEATURES : await this.getLimit();

    return this.featureRepo.claimForStart({
      featureId: input.featureId,
      targetLifecycle: input.targetLifecycle,
      updatedAt: input.now ?? new Date(),
      ...(input.requireQueued === undefined ? {} : { requireQueued: input.requireQueued }),
      ...(input.requireLifecycle === undefined ? {} : { requireLifecycle: input.requireLifecycle }),
      ...(input.requireAgentRunId === undefined
        ? {}
        : { requireAgentRunId: input.requireAgentRunId }),
      ...(input.agentRunId === undefined ? {} : { agentRunId: input.agentRunId }),
      capacity: {
        limit,
        runningLifecycles: [...RUNNING_LIFECYCLES],
        releasingRunStatuses: [...SLOT_RELEASING_RUN_STATUSES],
      },
    });
  }

  /** Full read model: limit, running count, remaining slots, and the queue. */
  async snapshot(): Promise<ParallelCapacitySnapshot> {
    const limit = await this.getLimit();
    const running = await this.getRunningCount();
    const queued = await this.featureRepo.listQueued();

    const unlimited = limit === UNLIMITED_PARALLEL_FEATURES;

    return {
      limit,
      unlimited,
      running,
      available: unlimited ? null : Math.max(0, limit - running),
      queue: queued.map((feature, index) => ({
        featureId: feature.id,
        position: index + 1,
        queuedAt: feature.queuedAt instanceof Date ? feature.queuedAt : new Date(feature.queuedAt),
      })),
    };
  }

  /**
   * The 1-based place a feature holds in the queue, or undefined when it is not
   * queued. Presentation reads this instead of re-deriving it from the entity.
   */
  async getQueuePosition(featureId: string): Promise<number | undefined> {
    const queued = await this.featureRepo.listQueued();
    const index = queued.findIndex((feature) => feature.id === featureId);
    return index === -1 ? undefined : index + 1;
  }
}
