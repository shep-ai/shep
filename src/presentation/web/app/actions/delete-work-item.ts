'use server';

import { resolve } from '@/lib/server-container';
import type { DeleteWorkItemUseCase } from '@shepai/core/application/use-cases/work-items/delete-work-item.use-case';

export async function deleteWorkItem(workItemId: string): Promise<{ error?: string }> {
  if (!workItemId?.trim()) {
    return { error: 'Work item ID is required' };
  }

  try {
    const useCase = resolve<DeleteWorkItemUseCase>('DeleteWorkItemUseCase');
    const result = await useCase.execute(workItemId);
    if (!result.ok) return { error: result.error };
    return {};
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to delete work item';
    return { error: message };
  }
}
