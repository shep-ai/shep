'use server';

import { resolve } from '@/lib/server-container';
import type { GetWorkItemUseCase } from '@shepai/core/application/use-cases/work-items/get-work-item.use-case';
import type { WorkItem } from '@shepai/core/domain/generated/output';

export async function getWorkItem(
  identifier: string
): Promise<{ workItem?: WorkItem; error?: string }> {
  if (!identifier?.trim()) {
    return { error: 'Work item identifier is required' };
  }

  try {
    const useCase = resolve<GetWorkItemUseCase>('GetWorkItemUseCase');
    const result = await useCase.execute(identifier);
    if (!result.ok) return { error: result.error };
    return { workItem: result.workItem };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to get work item';
    return { error: message };
  }
}
