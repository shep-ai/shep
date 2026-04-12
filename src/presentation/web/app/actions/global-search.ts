'use server';

import { resolve } from '@/lib/server-container';
import type {
  GlobalSearchUseCase,
  SearchResult,
} from '@shepai/core/application/use-cases/search/global-search.use-case';

export async function globalSearch(
  query: string
): Promise<{ results?: SearchResult[]; error?: string }> {
  if (!query?.trim()) {
    return { results: [] };
  }

  try {
    const useCase = resolve<GlobalSearchUseCase>('GlobalSearchUseCase');
    const results = await useCase.execute(query);
    return { results };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Search failed';
    return { error: message };
  }
}
