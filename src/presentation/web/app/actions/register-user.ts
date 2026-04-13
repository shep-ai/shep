'use server';

import { resolve } from '@/lib/server-container';
import type {
  RegisterUserUseCase,
  RegisterUserInput,
} from '@shepai/core/application/use-cases/auth/register-user.use-case';
import type { PmUser } from '@shepai/core/domain/generated/output';

export async function registerUser(
  input: RegisterUserInput
): Promise<{ user?: Omit<PmUser, 'passwordHash'>; error?: string }> {
  try {
    const useCase = resolve<RegisterUserUseCase>('RegisterUserUseCase');
    const result = await useCase.execute(input);
    if (!result.ok) return { error: result.error };
    return { user: result.user };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to register user';
    return { error: message };
  }
}
