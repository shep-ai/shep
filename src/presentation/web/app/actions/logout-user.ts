'use server';

import { resolve } from '@/lib/server-container';
import type { LogoutUserUseCase } from '@shepai/core/application/use-cases/auth/logout-user.use-case';

export async function logoutUser(sessionToken: string): Promise<{ error?: string }> {
  try {
    const useCase = resolve<LogoutUserUseCase>('LogoutUserUseCase');
    const result = await useCase.execute(sessionToken);
    if (!result.ok) return { error: result.error };
    return {};
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to logout';
    return { error: message };
  }
}
