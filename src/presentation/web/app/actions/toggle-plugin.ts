'use server';

import { revalidatePath } from 'next/cache';
import { resolve } from '@/lib/server-container';
import type { EnablePluginUseCase } from '@shepai/core/application/use-cases/plugins/enable-plugin.use-case';
import type { DisablePluginUseCase } from '@shepai/core/application/use-cases/plugins/disable-plugin.use-case';
import type { Plugin } from '@shepai/core/domain/generated/output';

export interface TogglePluginResult {
  plugin?: Plugin;
  error?: string;
}

export async function togglePlugin(
  pluginName: string,
  enabled: boolean
): Promise<TogglePluginResult> {
  try {
    if (enabled) {
      const useCase = resolve<EnablePluginUseCase>('EnablePluginUseCase');
      const plugin = await useCase.execute(pluginName);
      revalidatePath('/plugins');
      return { plugin };
    } else {
      const useCase = resolve<DisablePluginUseCase>('DisablePluginUseCase');
      const plugin = await useCase.execute(pluginName);
      revalidatePath('/plugins');
      return { plugin };
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to toggle plugin';
    return { error: message };
  }
}
