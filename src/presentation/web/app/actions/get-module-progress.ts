'use server';

import { resolve } from '@/lib/server-container';
import type { GetModuleProgressUseCase } from '@shepai/core/application/use-cases/analytics/get-module-progress.use-case';
import type { ModuleProgressItem } from '@shepai/core/application/use-cases/analytics/get-module-progress.use-case';

export async function getModuleProgress(
  projectId: string
): Promise<{ modules?: ModuleProgressItem[]; error?: string }> {
  if (!projectId?.trim()) {
    return { error: 'Project ID is required' };
  }

  try {
    const useCase = resolve<GetModuleProgressUseCase>('GetModuleProgressUseCase');
    const result = await useCase.execute(projectId);
    if (!result.ok) return { error: result.error };
    return { modules: result.modules };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to get module progress';
    return { error: message };
  }
}
