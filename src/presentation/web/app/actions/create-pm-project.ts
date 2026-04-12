'use server';

import { resolve } from '@/lib/server-container';
import type {
  CreatePmProjectUseCase,
  CreatePmProjectInput,
} from '@shepai/core/application/use-cases/pm-projects/create-pm-project.use-case';
import type { PmProject } from '@shepai/core/domain/generated/output';

export async function createPmProject(
  input: CreatePmProjectInput
): Promise<{ project?: PmProject; error?: string }> {
  try {
    const useCase = resolve<CreatePmProjectUseCase>('CreatePmProjectUseCase');
    const result = await useCase.execute(input);
    if (!result.ok) return { error: result.error };
    return { project: result.project };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to create project';
    return { error: message };
  }
}
