'use server';

import { resolve } from '@/lib/server-container';
import { errorMessage } from '@/lib/action-outcome';
import type { AdoptLocalRepositoryUseCase } from '@shepai/core/application/use-cases/applications/adopt-local-repository.use-case';

/**
 * Register an EXISTING local directory as an application.
 *
 * Unlike `createApplication` (which scaffolds a brand-new project), this
 * uses the folder as it is; `AdoptLocalRepositoryUseCase` names the
 * application after the folder and returns the one already registered at
 * that path, if any.
 */
export async function adoptLocalDirectory(input: {
  repositoryPath: string;
}): Promise<{ applicationId?: string; error?: string }> {
  try {
    const result = await resolve<AdoptLocalRepositoryUseCase>(
      'AdoptLocalRepositoryUseCase'
    ).execute(input.repositoryPath);
    return result.ok ? { applicationId: result.application.id } : { error: result.error };
  } catch (error) {
    return { error: errorMessage(error) };
  }
}
