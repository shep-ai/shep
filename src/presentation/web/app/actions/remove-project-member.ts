'use server';

import { resolve } from '@/lib/server-container';
import type {
  RemoveProjectMemberUseCase,
  RemoveProjectMemberInput,
} from '@shepai/core/application/use-cases/project-members/remove-project-member.use-case';

export async function removeProjectMember(
  input: RemoveProjectMemberInput
): Promise<{ error?: string }> {
  try {
    const useCase = resolve<RemoveProjectMemberUseCase>('RemoveProjectMemberUseCase');
    const result = await useCase.execute(input);
    if (!result.ok) return { error: result.error };
    return {};
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to remove member';
    return { error: message };
  }
}
