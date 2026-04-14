'use server';

import { resolve } from '@/lib/server-container';
import type {
  GetPluginCatalogUseCase,
  CatalogEntryWithStatus,
} from '@shepai/core/application/use-cases/plugins/get-plugin-catalog.use-case';

export interface GetPluginCatalogResult {
  catalog?: CatalogEntryWithStatus[];
  error?: string;
}

export async function getPluginCatalog(): Promise<GetPluginCatalogResult> {
  try {
    const useCase = resolve<GetPluginCatalogUseCase>('GetPluginCatalogUseCase');
    const catalog = await useCase.execute();
    return { catalog };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to load plugin catalog';
    return { error: message };
  }
}
