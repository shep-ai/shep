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
 */

import { injectable, inject } from 'tsyringe';
import { SdlcLifecycle } from '../../../domain/generated/output.js';
import type { IFeatureRepository } from '../../ports/output/repositories/feature-repository.interface.js';
import { CheckAndUnblockFeaturesUseCase } from './check-and-unblock-features.use-case.js';

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
    private readonly checkAndUnblock: CheckAndUnblockFeaturesUseCase
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
      } catch {
        // Isolate per parent — a failed rebase or spawn for one dependency chain
        // must not strand the others for another whole sweep cycle.
      }
    }

    return { unblockedFeatureIds: [...unblockedFeatureIds] };
  }
}
