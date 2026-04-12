'use server';

import { resolve } from '@/lib/server-container';
import type { ListWorkItemsUseCase } from '@shepai/core/application/use-cases/work-items/list-work-items.use-case';
import type { WorkItemFilter } from '@shepai/core/application/ports/output/repositories/work-item-repository.interface';
import type { WorkItem } from '@shepai/core/domain/generated/output';

export async function listWorkItems(
  projectId: string,
  filters?: WorkItemFilter
): Promise<{ workItems?: WorkItem[]; error?: string }> {
  if (!projectId?.trim()) {
    return { error: 'Project ID is required' };
  }

  try {
    const useCase = resolve<ListWorkItemsUseCase>('ListWorkItemsUseCase');
    const workItems = await useCase.execute(projectId, filters);
    return { workItems };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to list work items';
    return { error: message };
  }
}
