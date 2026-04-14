'use server';

import { revalidatePath } from 'next/cache';
import { resolve } from '@/lib/server-container';
import type { RemovePluginUseCase } from '@shepai/core/application/use-cases/plugins/remove-plugin.use-case';
import type { Plugin } from '@shepai/core/domain/generated/output';

export interface RemovePluginResult {
  plugin?: Plugin;
  error?: string;
}

export async function removePlugin(pluginName: string): Promise<RemovePluginResult> {
  try {
    const useCase = resolve<RemovePluginUseCase>('RemovePluginUseCase');
    const plugin = await useCase.execute(pluginName);
    revalidatePath('/plugins');
    return { plugin };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to remove plugin';
    return { error: message };
  }
}
