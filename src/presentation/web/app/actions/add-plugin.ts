'use server';

import { revalidatePath } from 'next/cache';
import { resolve } from '@/lib/server-container';
import type { AddPluginUseCase } from '@shepai/core/application/use-cases/plugins/add-plugin.use-case';
import type { Plugin } from '@shepai/core/domain/generated/output';

export interface AddPluginResult {
  plugin?: Plugin;
  error?: string;
}

export async function addPlugin(nameOrInput: string): Promise<AddPluginResult> {
  try {
    const useCase = resolve<AddPluginUseCase>('AddPluginUseCase');
    const plugin = await useCase.execute(nameOrInput);
    revalidatePath('/plugins');
    return { plugin };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to add plugin';
    return { error: message };
  }
}
