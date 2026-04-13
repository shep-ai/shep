'use server';

import { resolve } from '@/lib/server-container';
import type { LoginUserUseCase } from '@shepai/core/application/use-cases/auth/login-user.use-case';
import type { PmUser, PmSession } from '@shepai/core/domain/generated/output';

export async function loginUser(input: { email: string; password: string }): Promise<{
  user?: Omit<PmUser, 'passwordHash'>;
  session?: PmSession;
  error?: string;
}> {
  try {
    const useCase = resolve<LoginUserUseCase>('LoginUserUseCase');
    const result = await useCase.execute(input);
    if (!result.ok) return { error: result.error };
    return { user: result.user, session: result.session };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to login';
    return { error: message };
  }
}
