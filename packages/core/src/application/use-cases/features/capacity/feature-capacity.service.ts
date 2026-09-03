/**
 * FeatureCapacityService
 *
 * Answers "how many features are running, and may another one start?" for every
 * caller that needs it — admission on create and manual start, the queue drain,
 * and the read models the web/CLI/TUI render.
 *
 * The running count is DERIVED from lifecycle on every call rather than tracked
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
import {
  RUNNING_LIFECYCLES,
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
    return this.featureRepo.countByLifecycles([...RUNNING_LIFECYCLES]);
  }

  /**
   * May one more feature start right now?
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
