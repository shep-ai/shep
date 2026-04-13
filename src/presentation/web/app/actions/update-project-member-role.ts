'use server';

import { resolve } from '@/lib/server-container';
import type {
  UpdateProjectMemberRoleUseCase,
  UpdateProjectMemberRoleInput,
} from '@shepai/core/application/use-cases/project-members/update-project-member-role.use-case';

export async function updateProjectMemberRole(
  input: UpdateProjectMemberRoleInput
): Promise<{ error?: string }> {
  try {
    const useCase = resolve<UpdateProjectMemberRoleUseCase>('UpdateProjectMemberRoleUseCase');
    const result = await useCase.execute(input);
    if (!result.ok) return { error: result.error };
    return {};
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to update role';
    return { error: message };
  }
}
