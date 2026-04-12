'use server';

import { resolve } from '@/lib/server-container';
import type { ListWorkItemRelationsUseCase } from '@shepai/core/application/use-cases/work-item-relations/list-work-item-relations.use-case';
import type { WorkItemRelation } from '@shepai/core/application/ports/output/repositories/work-item-relation-repository.interface';

export async function listWorkItemRelations(
  workItemId: string
): Promise<{ relations?: WorkItemRelation[]; error?: string }> {
  if (!workItemId?.trim()) {
    return { error: 'Work item ID is required' };
  }

  try {
    const useCase = resolve<ListWorkItemRelationsUseCase>('ListWorkItemRelationsUseCase');
    const relations = await useCase.execute(workItemId);
    return { relations };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to list relations';
    return { error: message };
  }
}
