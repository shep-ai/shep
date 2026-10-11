/**
 * Archive Feature Use Case
 *
 * Transitions a feature's lifecycle to Archived, storing the current lifecycle
 * in previousLifecycle for restoration on unarchive.
 *
 * Business Rules:
 * - Any feature can be archived except those already Archived or Deleting
 * - Features with children CAN be archived — children visually reconnect to
 *   the repository on the canvas but the parent-child relationship is preserved
 *   in the database and restored when "Show Archived" is enabled
 * - The current lifecycle is preserved in previousLifecycle for unarchive restoration
 * - No agent cancellations are triggered and the branch and worktree are kept; the
 *   feature's git checkpoints (spec 138) are deleted
 */

import { injectable, inject } from 'tsyringe';
import type { Feature } from '../../../domain/generated/output.js';
import { SdlcLifecycle } from '../../../domain/generated/output.js';
import type { IFeatureRepository } from '../../ports/output/repositories/feature-repository.interface.js';
import { DeleteFeatureCheckpointsUseCase } from './checkpoints/delete-feature-checkpoints.use-case.js';

/** Lifecycle states that cannot be archived. */
const NON_ARCHIVABLE_STATES = new Set<SdlcLifecycle>([
  SdlcLifecycle.Archived,
  SdlcLifecycle.Deleting,
]);

@injectable()
export class ArchiveFeatureUseCase {
  constructor(
    @inject('IFeatureRepository') private readonly featureRepo: IFeatureRepository,
    @inject(DeleteFeatureCheckpointsUseCase)
    private readonly deleteCheckpoints: DeleteFeatureCheckpointsUseCase
  ) {}

  async execute(featureId: string): Promise<Feature> {
    // 1. Find feature (exact or prefix match)
    const feature =
      (await this.featureRepo.findById(featureId)) ??
      (await this.featureRepo.findByIdPrefix(featureId));
    if (!feature) {
      throw new Error(`Feature not found: "${featureId}"`);
    }

    // 2. Validate lifecycle is archivable
    if (NON_ARCHIVABLE_STATES.has(feature.lifecycle)) {
      throw new Error(
        `Cannot archive feature "${feature.name}": lifecycle is ${feature.lifecycle}. ` +
          `Features that are already archived or being deleted cannot be archived.`
      );
    }

    // 3. Store current lifecycle and transition to Archived
    const updatedFeature: Feature = {
      ...feature,
      previousLifecycle: feature.lifecycle,
      lifecycle: SdlcLifecycle.Archived,
      updatedAt: new Date(),
    };

    await this.featureRepo.update(updatedFeature);

    // 4. Archived work keeps its branch; its step snapshots are dropped.
    await this.deleteCheckpoints.executeBestEffort({
      featureId: feature.id,
      repositoryPath: feature.repositoryPath,
    });

    return updatedFeature;
  }
}
