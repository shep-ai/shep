'use server';

import { resolve } from '@/lib/server-container';
import type {
  CreateWorkItemRelationUseCase,
  CreateWorkItemRelationInput,
} from '@shepai/core/application/use-cases/work-item-relations/create-work-item-relation.use-case';
import type { WorkItemRelation } from '@shepai/core/application/ports/output/repositories/work-item-relation-repository.interface';

export async function createWorkItemRelation(
  input: CreateWorkItemRelationInput
): Promise<{ relation?: WorkItemRelation; error?: string }> {
  try {
    const useCase = resolve<CreateWorkItemRelationUseCase>('CreateWorkItemRelationUseCase');
    const result = await useCase.execute(input);
    if (!result.ok) return { error: result.error };
    return { relation: result.relation };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to create relation';
    return { error: message };
  }
}
