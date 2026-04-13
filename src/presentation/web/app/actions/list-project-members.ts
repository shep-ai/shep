'use server';

import { resolve } from '@/lib/server-container';
import type { ListProjectMembersUseCase } from '@shepai/core/application/use-cases/project-members/list-project-members.use-case';
import type { PmProjectMember } from '@shepai/core/domain/generated/output';

export async function listProjectMembers(
  projectId: string
): Promise<{ members?: PmProjectMember[]; error?: string }> {
  if (!projectId?.trim()) {
    return { error: 'Project ID is required' };
  }

  try {
    const useCase = resolve<ListProjectMembersUseCase>('ListProjectMembersUseCase');
    const result = await useCase.execute(projectId);
    if (!result.ok) return { error: result.error };
    return { members: result.members };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to list members';
    return { error: message };
  }
}
