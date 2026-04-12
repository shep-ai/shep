'use server';

import { resolve } from '@/lib/server-container';
import type { DeleteWorkItemRelationUseCase } from '@shepai/core/application/use-cases/work-item-relations/delete-work-item-relation.use-case';

export async function deleteWorkItemRelation(relationId: string): Promise<{ error?: string }> {
  if (!relationId?.trim()) {
    return { error: 'Relation ID is required' };
  }

  try {
    const useCase = resolve<DeleteWorkItemRelationUseCase>('DeleteWorkItemRelationUseCase');
    const result = await useCase.execute(relationId);
    if (!result.ok) return { error: result.error };
    return {};
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to delete relation';
    return { error: message };
  }
}
