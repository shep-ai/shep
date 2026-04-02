'use server';

import { resolve } from '@/lib/server-container';
import type { DeleteFeatureUseCase } from '@shepai/core/application/use-cases/features/delete-feature.use-case';
import type { IFeatureRepository } from '@shepai/core/application/ports/output/repositories/feature-repository.interface';
import { FeatureMode } from '@shepai/core/domain/generated/output';

/**
 * Discard an exploration feature, cleaning up the worktree and branch.
 * Validates the feature is in exploration mode before deleting.
 */
export async function discardExploration(
  featureId: string
): Promise<{ discarded: boolean; error?: string }> {
  if (!featureId.trim()) {
    return { discarded: false, error: 'Feature id is required' };
  }

  try {
    const featureRepo = resolve<IFeatureRepository>('IFeatureRepository');
    const feature = await featureRepo.findById(featureId);

    if (!feature) {
      return { discarded: false, error: 'Feature not found' };
    }

    if (feature.mode !== FeatureMode.Exploration) {
      return { discarded: false, error: 'Feature is not in exploration mode' };
    }

    const deleteUseCase = resolve<DeleteFeatureUseCase>('DeleteFeatureUseCase');
    await deleteUseCase.execute(featureId, { cleanup: true });
    return { discarded: true };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to discard exploration';
    return { discarded: false, error: message };
  }
}
