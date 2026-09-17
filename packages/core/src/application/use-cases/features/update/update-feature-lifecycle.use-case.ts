/**
 * UpdateFeatureLifecycleUseCase
 *
 * Centralises all feature lifecycle transitions. Every call to this use case:
 * 1. Persists the new lifecycle value via the feature repository.
 * 2. Immediately calls CheckAndUnblockFeaturesUseCase to evaluate whether
 *    any blocked children can now be unblocked.
 *
 * This is the single hook point that ensures auto-unblocking fires on every
 * lifecycle transition made by the feature agent, satisfying FR-17.
 *
 * Being the single hook point, it is also where the dependency gate is
 * enforced on the write side: a Blocked feature must not be advanced while the
 * work it depends on has not landed. Without that guard the gate is advisory —
 * an agent that was already running when the dependency was declared keeps
 * reporting phases, and the first one overwrites Blocked with real progress.
 *
 * No-op when the feature is not found (swallowed gracefully so agent nodes
 * do not crash on a missing feature record). A write refused by the gate is
 * logged, so a caller whose command appeared to do nothing has a reason.
 */

import { injectable, inject } from 'tsyringe';
import { SdlcLifecycle } from '../../../../domain/generated/output.js';
import type { IFeatureRepository } from '../../../ports/output/repositories/feature-repository.interface.js';
import type { ILogger } from '../../../ports/output/services/logger.interface.js';
import { allowsLifecycleWrite } from '../../../../domain/lifecycle-gates.js';
import { CheckAndUnblockFeaturesUseCase } from '../check-and-unblock-features.use-case.js';

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
    @inject('ILogger') private readonly logger: ILogger
  ) {}

  async execute(input: UpdateFeatureLifecycleInput): Promise<void> {
    const feature = await this.featureRepo.findById(input.featureId);
    if (!feature) {
      return;
    }

    // Dependency gate — a Blocked feature stays Blocked until its parent's work
    // has landed. Loading the parent is skipped entirely for the overwhelmingly
    // common case (feature is not Blocked), so this costs nothing on the hot path.
    const parent =
      feature.lifecycle === SdlcLifecycle.Blocked && feature.parentId
        ? await this.featureRepo.findById(feature.parentId)
        : null;
    if (!allowsLifecycleWrite(feature, parent, input.lifecycle)) {
      // A refused write resolves exactly like an accepted one, so without this
      // line a user action on the canvas that silently does nothing has no
      // explanation anywhere. Warn rather than throw: the common caller is an
      // agent node reporting a phase, and the gate holding is expected there.
      this.logger.warn('[UpdateFeatureLifecycleUseCase] blocked by dependency gate', {
        featureId: feature.id,
        target: input.lifecycle,
        parentId: feature.parentId,
        parentLifecycle: parent?.lifecycle,
      });
      return;
    }

    feature.lifecycle = input.lifecycle;
    feature.updatedAt = new Date();
    await this.featureRepo.update(feature);

    await this.checkAndUnblock.execute(input.featureId);
  }
}
