'use server';

import { resolve } from '@/lib/server-container';
import type { ListPluginsUseCase } from '@shepai/core/application/use-cases/plugins/list-plugins.use-case';
import type { Plugin } from '@shepai/core/domain/generated/output';

export interface ListPluginsResult {
  plugins?: Plugin[];
  error?: string;
}

export async function listPlugins(): Promise<ListPluginsResult> {
  try {
    const useCase = resolve<ListPluginsUseCase>('ListPluginsUseCase');
    const plugins = await useCase.execute();
    return { plugins };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to list plugins';
    return { error: message };
  }
}
