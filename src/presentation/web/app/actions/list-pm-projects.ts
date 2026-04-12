'use server';

import { resolve } from '@/lib/server-container';
import type { ListPmProjectsUseCase } from '@shepai/core/application/use-cases/pm-projects/list-pm-projects.use-case';
import type { PmProject } from '@shepai/core/domain/generated/output';

export async function listPmProjects(): Promise<{ projects?: PmProject[]; error?: string }> {
  try {
    const useCase = resolve<ListPmProjectsUseCase>('ListPmProjectsUseCase');
    const projects = await useCase.execute();
    return { projects };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to list projects';
    return { error: message };
  }
}
