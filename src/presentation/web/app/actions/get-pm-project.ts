'use server';

import { resolve } from '@/lib/server-container';
import type { GetPmProjectUseCase } from '@shepai/core/application/use-cases/pm-projects/get-pm-project.use-case';
import type { PmProject } from '@shepai/core/domain/generated/output';

export async function getPmProject(
  projectIdOrSlug: string
): Promise<{ project?: PmProject; error?: string }> {
  if (!projectIdOrSlug?.trim()) {
    return { error: 'Project ID or slug is required' };
  }

  try {
    const useCase = resolve<GetPmProjectUseCase>('GetPmProjectUseCase');
    const result = await useCase.execute(projectIdOrSlug);
    if (!result.ok) return { error: result.error };
    return { project: result.project };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to get project';
    return { error: message };
  }
}
