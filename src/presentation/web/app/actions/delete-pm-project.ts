'use server';

import { resolve } from '@/lib/server-container';
import type { DeletePmProjectUseCase } from '@shepai/core/application/use-cases/pm-projects/delete-pm-project.use-case';

export async function deletePmProject(projectId: string): Promise<{ error?: string }> {
  if (!projectId?.trim()) {
    return { error: 'Project ID is required' };
  }

  try {
    const useCase = resolve<DeletePmProjectUseCase>('DeletePmProjectUseCase');
    const result = await useCase.execute(projectId);
    if (!result.ok) return { error: result.error };
    return {};
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to delete project';
    return { error: message };
  }
}
