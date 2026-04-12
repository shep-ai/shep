'use server';

import { resolve } from '@/lib/server-container';
import type {
  UpdateWorkItemUseCase,
  UpdateWorkItemInput,
} from '@shepai/core/application/use-cases/work-items/update-work-item.use-case';

export async function updateWorkItem(
  workItemId: string,
  input: UpdateWorkItemInput
): Promise<{ error?: string }> {
  if (!workItemId?.trim()) {
    return { error: 'Work item ID is required' };
  }

  try {
    const useCase = resolve<UpdateWorkItemUseCase>('UpdateWorkItemUseCase');
    const result = await useCase.execute(workItemId, input);
    if (!result.ok) return { error: result.error };
    return {};
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to update work item';
    return { error: message };
  }
}
