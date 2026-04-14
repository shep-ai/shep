'use server';

import { revalidatePath } from 'next/cache';
import { resolve } from '@/lib/server-container';
import type { ConfigurePluginUseCase } from '@shepai/core/application/use-cases/plugins/configure-plugin.use-case';
import type { Plugin } from '@shepai/core/domain/generated/output';

export interface ConfigurePluginResult {
  plugin?: Plugin;
  error?: string;
}

export async function configurePlugin(
  pluginName: string,
  activeToolGroups: string[]
): Promise<ConfigurePluginResult> {
  try {
    const useCase = resolve<ConfigurePluginUseCase>('ConfigurePluginUseCase');
    const plugin = await useCase.execute(pluginName, { activeToolGroups });
    revalidatePath('/plugins');
    return { plugin };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to configure plugin';
    return { error: message };
  }
}
