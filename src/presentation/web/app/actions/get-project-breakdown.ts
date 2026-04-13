'use server';

import { resolve } from '@/lib/server-container';
import type { GetProjectBreakdownUseCase } from '@shepai/core/application/use-cases/analytics/get-project-breakdown.use-case';
import type { ProjectBreakdownData } from '@shepai/core/application/use-cases/analytics/get-project-breakdown.use-case';

export async function getProjectBreakdown(
  projectId: string
): Promise<{ data?: ProjectBreakdownData; error?: string }> {
  if (!projectId?.trim()) {
    return { error: 'Project ID is required' };
  }

  try {
    const useCase = resolve<GetProjectBreakdownUseCase>('GetProjectBreakdownUseCase');
    const result = await useCase.execute(projectId);
    if (!result.ok) return { error: result.error };
    return { data: result.data };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to get project breakdown';
    return { error: message };
  }
}
