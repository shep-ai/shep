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
  isFleetQueuePaused,
  isRunningLifecycle,
  resolveConfiguredMaxParallelFeatures,
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
  /**
   * True while the fleet admission queue is parked (circuit breaker, or
   * `shep fleet pause`). Independent of `limit`: a pause overrides the ceiling
   * without replacing it, so the configured number survives a resume.
   */
  paused: boolean;
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

  /**
   * The limit admission is governed by right now. 0 means "admit nothing" while
   * the queue is paused, and "unlimited" otherwise — which is why gating
   * callers must also read {@link isPaused} rather than testing this number.
   */
  async getLimit(): Promise<number> {
    return resolveMaxParallelFeatures(await this.settingsRepository.load());
  }

  /**
   * The ceiling the user configured, ignoring any pause.
   *
   * Read by persistence and the UI, which must show the number the user chose
   * and not the pause's 0 — otherwise a paused fleet displays "unlimited" and a
   * resume has no ceiling left to restore.
   */
  async getConfiguredLimit(): Promise<number> {
    return resolveConfiguredMaxParallelFeatures(await this.settingsRepository.load());
  }

  /** Is the fleet admission queue parked? */
  async isPaused(): Promise<boolean> {
    return isFleetQueuePaused(await this.settingsRepository.load());
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
    const settings = await this.settingsRepository.load();
    // Checked before the limit: a paused queue resolves to a limit of 0, and 0
    // already means UNLIMITED, so a limit-only test would report plenty of room
    // for a fleet the user parked.
    if (isFleetQueuePaused(settings)) {
      return false;
    }
    const limit = resolveMaxParallelFeatures(settings);
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
    const settings = await this.settingsRepository.load();

    // The pause governs ADMISSION, so it only refuses work that would occupy a
    // slot. A caller resuming a lifecycle outside the running set — a failed
    // merge sitting in Review, for example — is not asking for capacity at all:
    // `ResumeFeatureUseCase` passes `bypassLimit` for exactly those, and
    // refusing them would go beyond "stop starting new work" to "stop finishing
    // work already in flight".
    const occupiesSlot = isRunningLifecycle(input.targetLifecycle);
    if (occupiesSlot && isFleetQueuePaused(settings)) {
      return false;
    }

    // The pause outranks `bypassLimit` for work that DOES take a slot. That flag
    // is the user's "start anyway" against the CEILING; a fleet parked because
    // everything is failing must not restart on the strength of one forced
    // start.
    const limit =
      input.bypassLimit === true || !occupiesSlot
        ? UNLIMITED_PARALLEL_FEATURES
        : resolveMaxParallelFeatures(settings);

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
    const settings = await this.settingsRepository.load();
    const paused = isFleetQueuePaused(settings);
    // Deliberately the CONFIGURED ceiling, not the paused 0: the snapshot is
    // what the UI renders, and "unlimited" is a lie for a parked fleet.
    const limit = resolveConfiguredMaxParallelFeatures(settings);
    const running = await this.getRunningCount();
    const queued = await this.featureRepo.listQueued();

    const unlimited = limit === UNLIMITED_PARALLEL_FEATURES;

    return {
      limit,
      unlimited,
      paused,
      running,
      available: paused ? 0 : unlimited ? null : Math.max(0, limit - running),
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
