'use server';

import { resolve } from '@/lib/server-container';
import type { ReparentFeatureUseCase } from '@shepai/core/application/use-cases/features/reparent-feature.use-case';

export async function reparentFeature(
  featureId: string,
  parentId: string | null
): Promise<{ success: boolean; error?: string }> {
  if (!featureId.trim()) {
    return { success: false, error: 'Feature id is required' };
  }

  try {
    const useCase = resolve<ReparentFeatureUseCase>('ReparentFeatureUseCase');
    await useCase.execute({ featureId, parentId });
    return { success: true };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to reparent feature';
    return { success: false, error: message };
  }
}
