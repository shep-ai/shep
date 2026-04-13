'use server';

import { resolve } from '@/lib/server-container';
import type {
  AddProjectMemberUseCase,
  AddProjectMemberInput,
} from '@shepai/core/application/use-cases/project-members/add-project-member.use-case';
import type { PmProjectMember } from '@shepai/core/domain/generated/output';

export async function addProjectMember(
  input: AddProjectMemberInput
): Promise<{ member?: PmProjectMember; error?: string }> {
  try {
    const useCase = resolve<AddProjectMemberUseCase>('AddProjectMemberUseCase');
    const result = await useCase.execute(input);
    if (!result.ok) return { error: result.error };
    return { member: result.member };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to add member';
    return { error: message };
  }
}
