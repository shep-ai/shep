'use server';

import { resolve } from '@/lib/server-container';
import type {
  DiscoverImportCandidatesUseCase,
  ImportCandidate,
} from '@shepai/core/application/use-cases/repositories/discover-import-candidates.use-case';
import type {
  ImportLocalRepositoriesUseCase,
  ImportLocalRepositoryResult,
} from '@shepai/core/application/use-cases/repositories/import-local-repositories.use-case';

export interface DiscoverCandidatesResponse {
  directoryPath?: string;
  candidates?: ImportCandidate[];
  error?: string;
}

export interface ImportLocalRepositoriesResponse {
  results?: ImportLocalRepositoryResult[];
  importedCount?: number;
  failedCount?: number;
  error?: string;
}

/**
 * List the immediate subfolders of a directory as bulk-import candidates.
 *
 * Thin adapter — annotation and normalization live in the use case.
 */
export async function discoverImportCandidates(input: {
  directoryPath: string;
}): Promise<DiscoverCandidatesResponse> {
  if (!input.directoryPath?.trim()) {
    return { error: 'directoryPath is required' };
  }

  try {
    const useCase = resolve<DiscoverImportCandidatesUseCase>('DiscoverImportCandidatesUseCase');
    const result = await useCase.execute({ directoryPath: input.directoryPath });
    return { directoryPath: result.directoryPath, candidates: result.candidates };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to read directory';
    return { error: message };
  }
}

/**
 * Import the selected folders as tracked repositories.
 *
 * Returns per-path results so the UI can surface partial failures instead of
 * silently reporting success.
 */
export async function importLocalRepositories(input: {
  paths: string[];
}): Promise<ImportLocalRepositoriesResponse> {
  if (!input.paths?.length) {
    return { results: [], importedCount: 0, failedCount: 0 };
  }

  try {
    const useCase = resolve<ImportLocalRepositoriesUseCase>('ImportLocalRepositoriesUseCase');
    const result = await useCase.execute({ paths: input.paths });
    return {
      results: result.results,
      importedCount: result.importedCount,
      failedCount: result.failedCount,
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to import repositories';
    return { error: message };
  }
}
