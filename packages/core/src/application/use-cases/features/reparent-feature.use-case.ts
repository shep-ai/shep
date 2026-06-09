/**
 * ReparentFeatureUseCase
 *
 * Updates a feature's parent dependency (or clears it). Performs validation:
 * - Same-repository constraint (child and parent must share repositoryPath)
 * - Cycle detection via upward ancestor walk
 * - Lifecycle guards (cannot reparent completed/archived/deleting features)
 * - Lifecycle state adjustment based on new parent's lifecycle
 *
 * After reparenting, if the new parent is post-implementation, calls
 * CheckAndUnblockFeaturesUseCase to trigger the unblock+rebase flow
 * for any Blocked children of the reparented feature.
 */

import { injectable, inject } from 'tsyringe';
import { SdlcLifecycle } from '../../../domain/generated/output.js';
import type { IFeatureRepository } from '../../ports/output/repositories/feature-repository.interface.js';
import { POST_IMPLEMENTATION } from '../../../domain/lifecycle-gates.js';
import { CheckAndUnblockFeaturesUseCase } from './check-and-unblock-features.use-case.js';

/** Lifecycle states that cannot be reparented. */
const NON_REPARENTABLE_STATES = new Set<SdlcLifecycle>([
  SdlcLifecycle.Maintain,
  SdlcLifecycle.Archived,
  SdlcLifecycle.Deleting,
]);

export interface ReparentFeatureInput {
  featureId: string;
  parentId: string | null;
}

@injectable()
export class ReparentFeatureUseCase {
  constructor(
    @inject('IFeatureRepository')
    private readonly featureRepo: IFeatureRepository,
    @inject(CheckAndUnblockFeaturesUseCase)
    private readonly checkAndUnblock: CheckAndUnblockFeaturesUseCase
  ) {}

  async execute(input: ReparentFeatureInput): Promise<void> {
    const { featureId, parentId } = input;

    // Self-reparent guard
    if (parentId !== null && featureId === parentId) {
      throw new Error('A feature cannot be set as parent of itself.');
    }

    // Load child feature
    const child = await this.featureRepo.findById(featureId);
    if (!child) {
      throw new Error(`Feature not found: ${featureId}`);
    }

    // Lifecycle guard — reject completed/terminal features
    if (NON_REPARENTABLE_STATES.has(child.lifecycle)) {
      throw new Error(
        `Cannot reparent feature "${child.name}": lifecycle is ${child.lifecycle}. ` +
          'Only active features can be reparented.'
      );
    }

    // Unparent case
    if (parentId === null) {
      const newLifecycle =
        child.lifecycle === SdlcLifecycle.Blocked ? SdlcLifecycle.Started : child.lifecycle;
      await this.featureRepo.update({
        ...child,
        parentId: undefined,
        lifecycle: newLifecycle,
        updatedAt: new Date(),
      });
      return;
    }

    // Load parent feature
    const parent = await this.featureRepo.findById(parentId);
    if (!parent) {
      throw new Error(`Parent feature not found: ${parentId}`);
    }

    // Same-repository constraint
    if (child.repositoryPath !== parent.repositoryPath) {
      throw new Error('Features must be in the same repository to form a dependency.');
    }

    // Cycle detection — walk from proposed parent upward
    await this.detectCycle(featureId, parentId);

    // Determine lifecycle adjustment based on new parent's lifecycle
    let newLifecycle = child.lifecycle;
    if (parent.lifecycle === SdlcLifecycle.Blocked || !POST_IMPLEMENTATION.has(parent.lifecycle)) {
      // Parent is pre-implementation or Blocked — child should be Blocked
      if (child.lifecycle !== SdlcLifecycle.Blocked && child.lifecycle !== SdlcLifecycle.Pending) {
        newLifecycle = SdlcLifecycle.Blocked;
      }
    }

    // Persist the reparent
    await this.featureRepo.update({
      ...child,
      parentId,
      lifecycle: newLifecycle,
      updatedAt: new Date(),
    });

    // If new parent is post-implementation, trigger unblock flow for the
    // reparented feature's own children (the feature itself may now be a parent
    // of Blocked children that should be unblocked)
    if (POST_IMPLEMENTATION.has(parent.lifecycle)) {
      await this.checkAndUnblock.execute(featureId);
    }
  }

  /**
   * Walk the ancestor chain from the proposed parent upward.
   * If the child feature ID is found in the chain, a cycle exists.
   */
  private async detectCycle(childId: string, parentId: string): Promise<void> {
    const visited = new Set<string>([childId]);
    let cursor: string | undefined = parentId;

    while (cursor) {
      if (visited.has(cursor)) {
        throw new Error(
          `Cycle detected in feature dependency chain. ` +
            `Setting ${parentId} as parent of ${childId} would create a circular dependency.`
        );
      }
      visited.add(cursor);
      const ancestor = await this.featureRepo.findById(cursor);
      cursor = ancestor?.parentId ?? undefined;
    }
  }
}
