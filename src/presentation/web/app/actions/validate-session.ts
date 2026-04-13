'use server';

import { resolve } from '@/lib/server-container';
import type { ValidateSessionUseCase } from '@shepai/core/application/use-cases/auth/validate-session.use-case';
import type { PmUser } from '@shepai/core/domain/generated/output';

export async function validateSession(
  sessionToken: string
): Promise<{ user?: Omit<PmUser, 'passwordHash'>; error?: string }> {
  try {
    const useCase = resolve<ValidateSessionUseCase>('ValidateSessionUseCase');
    const result = await useCase.execute(sessionToken);
    if (!result.ok) return { error: result.error };
    return { user: result.user };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to validate session';
    return { error: message };
  }
}
