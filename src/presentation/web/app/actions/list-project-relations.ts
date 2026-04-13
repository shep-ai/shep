'use server';

import { resolve } from '@/lib/server-container';
import type { ListWorkItemRelationsUseCase } from '@shepai/core/application/use-cases/work-item-relations/list-work-item-relations.use-case';
import type { ListWorkItemsUseCase } from '@shepai/core/application/use-cases/work-items/list-work-items.use-case';
import type { WorkItemRelation } from '@shepai/core/application/ports/output/repositories/work-item-relation-repository.interface';

export async function listProjectRelations(
  projectId: string
): Promise<{ relations?: WorkItemRelation[]; error?: string }> {
  if (!projectId?.trim()) {
    return { error: 'Project ID is required' };
  }

  try {
    const listItems = resolve<ListWorkItemsUseCase>('ListWorkItemsUseCase');
    const listRelations = resolve<ListWorkItemRelationsUseCase>('ListWorkItemRelationsUseCase');

    const items = await listItems.execute(projectId);
    const allRelations = new Map<string, WorkItemRelation>();

    for (const item of items) {
      const rels = await listRelations.execute(item.id);
      for (const rel of rels) {
        allRelations.set(rel.id, rel);
      }
    }

    return { relations: Array.from(allRelations.values()) };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to list project relations';
    return { error: message };
  }
}
