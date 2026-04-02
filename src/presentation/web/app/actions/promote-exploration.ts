'use server';

import { resolve } from '@/lib/server-container';
import type { PromoteExplorationUseCase } from '@shepai/core/application/use-cases/features/promote/promote-exploration.use-case';
import type { Feature, FeatureMode } from '@shepai/core/domain/generated/output';

/**
 * Promote an exploration feature to Regular or Fast mode.
 * Transitions the feature from Exploring lifecycle to the appropriate
 * starting state and spawns the new agent graph.
 */
export async function promoteExploration(
  featureId: string,
  targetMode: FeatureMode.Regular | FeatureMode.Fast
): Promise<{ feature?: Feature; error?: string }> {
  if (!featureId.trim()) {
    return { error: 'Feature id is required' };
  }

  try {
    const useCase = resolve<PromoteExplorationUseCase>('PromoteExplorationUseCase');
    const result = await useCase.execute({ featureId, targetMode });
    return { feature: result.feature };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to promote exploration';
    return { error: message };
  }
}
