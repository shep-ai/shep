'use server';

import { revalidatePath } from 'next/cache';
import { resolve } from '@/lib/server-container';
import type { CheckPluginHealthUseCase } from '@shepai/core/application/use-cases/plugins/check-plugin-health.use-case';
import type { PluginHealthResult } from '@shepai/core/application/ports/output/services/plugin-health-checker.interface';

export interface CheckPluginHealthResult {
  results?: PluginHealthResult[];
  error?: string;
}

export async function checkPluginHealth(pluginName?: string): Promise<CheckPluginHealthResult> {
  try {
    const useCase = resolve<CheckPluginHealthUseCase>('CheckPluginHealthUseCase');
    const results = await useCase.execute(pluginName);
    revalidatePath('/plugins');
    return { results };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to check plugin health';
    return { error: message };
  }
}
