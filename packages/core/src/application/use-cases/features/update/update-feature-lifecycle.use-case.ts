/**
 * UpdateFeatureLifecycleUseCase
 *
 * Centralises all feature lifecycle transitions. Every call to this use case:
 * 1. Persists the new lifecycle value via the feature repository.
 * 2. Immediately calls CheckAndUnblockFeaturesUseCase to evaluate whether
 *    any blocked children can now be unblocked.
 * 3. Drains the parallel-capacity queue, because a transition out of a running
 *    lifecycle is exactly what frees a slot.
 *
 * This is the single hook point that ensures auto-unblocking fires on every
 * lifecycle transition made by the feature agent, satisfying FR-17.
 *
 * The drain runs after the unblock so a child released by this very transition
 * is already queued (rather than still Blocked) by the time the queue is walked,
 * and can therefore be admitted in the same pass when a slot is free.
 *
 * No-op when the feature is not found (swallowed gracefully so agent nodes
 * do not crash on a missing feature record).
 */

import { injectable, inject } from 'tsyringe';
import type { SdlcLifecycle } from '../../../../domain/generated/output.js';
import type { IFeatureRepository } from '../../../ports/output/repositories/feature-repository.interface.js';
import { CheckAndUnblockFeaturesUseCase } from '../check-and-unblock-features.use-case.js';
import { AdmitQueuedFeaturesUseCase } from '../capacity/admit-queued-features.use-case.js';

export interface UpdateFeatureLifecycleInput {
  featureId: string;
  lifecycle: SdlcLifecycle;
}

@injectable()
export class UpdateFeatureLifecycleUseCase {
  constructor(
    @inject('IFeatureRepository') private readonly featureRepo: IFeatureRepository,
    @inject(CheckAndUnblockFeaturesUseCase)
    private readonly checkAndUnblock: CheckAndUnblockFeaturesUseCase,
    @inject(AdmitQueuedFeaturesUseCase)
    private readonly admitQueued: AdmitQueuedFeaturesUseCase
  ) {}

  async execute(input: UpdateFeatureLifecycleInput): Promise<void> {
    const feature = await this.featureRepo.findById(input.featureId);
    if (!feature) {
      return;
    }

    feature.lifecycle = input.lifecycle;
    feature.updatedAt = new Date();
    await this.featureRepo.update(feature);

    await this.checkAndUnblock.execute(input.featureId);

    // Isolated: a queue drain that fails must not turn a successful lifecycle
    // transition into an error for the agent node that reported it.
    try {
      await this.admitQueued.execute();
    } catch {
      // The state-side sweep will retry on the next dashboard load.
    }
  }
}
