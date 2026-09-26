'use server';

import { revalidatePath } from 'next/cache';
import { resolve } from '@/lib/server-container';
import {
  resetSettings,
  initializeSettings,
} from '@shepai/core/infrastructure/services/settings.service';
import type { SetDefaultEffortUseCase } from '@shepai/core/application/use-cases/settings/set-default-effort.use-case';

/**
 * Server action that sets or clears the default reasoning effort.
 *
 * Validation and the set/clear rule live in SetDefaultEffortUseCase; this
 * action only refreshes the in-memory settings singleton afterwards.
 *
 * @param effort - An effort level, or null for "agent default"
 */
export async function updateDefaultEffort(
  effort: string | null
): Promise<{ ok: boolean; error?: string }> {
  try {
    const useCase = resolve<SetDefaultEffortUseCase>('SetDefaultEffortUseCase');
    const updated = await useCase.execute({ effort });

    resetSettings();
    initializeSettings(updated);
    revalidatePath('/', 'layout');

    return { ok: true };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to update effort';
    return { ok: false, error: message };
  }
}
