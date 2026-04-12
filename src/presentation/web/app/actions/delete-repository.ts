'use server';

import { resolve } from '@/lib/server-container';
import type { DeleteRepositoryUseCase } from '@shepai/core/application/use-cases/repositories/delete-repository.use-case';

export interface DeleteRepositoryActionOptions {
  deleteFromDisk?: boolean;
}

export async function deleteRepository(
  repositoryId: string,
  options?: DeleteRepositoryActionOptions
): Promise<{ success: boolean; error?: string }> {
  if (!repositoryId?.trim()) {
    return { success: false, error: 'id is required' };
  }

  try {
    const useCase = resolve<DeleteRepositoryUseCase>('DeleteRepositoryUseCase');
    await useCase.execute(repositoryId, { deleteFromDisk: options?.deleteFromDisk === true });
    return { success: true };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to delete repository';
    return { success: false, error: message };
  }
}
