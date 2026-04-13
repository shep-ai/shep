'use server';

import { resolve } from '@/lib/server-container';
import type { ListModulesUseCase } from '@shepai/core/application/use-cases/modules/list-modules.use-case';
import type { PmModule } from '@shepai/core/domain/generated/output';

export async function listModules(
  projectId: string
): Promise<{ modules?: PmModule[]; error?: string }> {
  if (!projectId?.trim()) {
    return { error: 'Project ID is required' };
  }

  try {
    const useCase = resolve<ListModulesUseCase>('ListModulesUseCase');
    const modules = await useCase.execute(projectId);
    return { modules };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to list modules';
    return { error: message };
  }
}
