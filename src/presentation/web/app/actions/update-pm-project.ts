'use server';

import { resolve } from '@/lib/server-container';
import type {
  UpdatePmProjectUseCase,
  UpdatePmProjectInput,
} from '@shepai/core/application/use-cases/pm-projects/update-pm-project.use-case';

export async function updatePmProject(
  projectId: string,
  input: UpdatePmProjectInput
): Promise<{ error?: string }> {
  if (!projectId?.trim()) {
    return { error: 'Project ID is required' };
  }

  try {
    const useCase = resolve<UpdatePmProjectUseCase>('UpdatePmProjectUseCase');
    const result = await useCase.execute(projectId, input);
    if (!result.ok) return { error: result.error };
    return {};
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to update project';
    return { error: message };
  }
}
