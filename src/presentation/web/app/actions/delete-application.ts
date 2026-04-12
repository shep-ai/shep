'use server';

import { resolve } from '@/lib/server-container';
import type { DeleteApplicationUseCase } from '@shepai/core/application/use-cases/applications/delete-application.use-case';

export async function deleteApplication(id: string): Promise<{ error?: string }> {
  if (!id?.trim()) {
    return { error: 'Application ID is required' };
  }

  try {
    const useCase = resolve<DeleteApplicationUseCase>('DeleteApplicationUseCase');
    await useCase.execute(id);
    return {};
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to delete application';
    return { error: message };
  }
}
