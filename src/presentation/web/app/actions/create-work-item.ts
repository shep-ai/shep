'use server';

import { resolve } from '@/lib/server-container';
import type {
  CreateWorkItemUseCase,
  CreateWorkItemInput,
} from '@shepai/core/application/use-cases/work-items/create-work-item.use-case';
import type { WorkItem } from '@shepai/core/domain/generated/output';

export async function createWorkItem(
  input: CreateWorkItemInput
): Promise<{ workItem?: WorkItem; error?: string }> {
  try {
    const useCase = resolve<CreateWorkItemUseCase>('CreateWorkItemUseCase');
    const result = await useCase.execute(input);
    if (!result.ok) return { error: result.error };
    return { workItem: result.workItem };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to create work item';
    return { error: message };
  }
}
