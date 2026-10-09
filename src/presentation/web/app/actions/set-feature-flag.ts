'use server';

import { revalidatePath } from 'next/cache';
import { resolve } from '@/lib/server-container';
import {
  resetSettings,
  initializeSettings,
} from '@shepai/core/infrastructure/services/settings.service';
import type { SetFeatureFlagUseCase } from '@shepai/core/application/use-cases/settings/set-feature-flag.use-case';

/**
 * Turns one feature flag on or off (spec 133).
 *
 * Validation lives in SetFeatureFlagUseCase; this action refreshes the
 * in-memory settings singleton and the layout so the sidebar follows.
 */
export async function setFeatureFlag(
  key: string,
  enabled: boolean
): Promise<{ ok: boolean; error?: string }> {
  try {
    const updated = await resolve<SetFeatureFlagUseCase>('SetFeatureFlagUseCase').execute({
      key,
      enabled,
    });
    resetSettings();
    initializeSettings(updated);
    revalidatePath('/', 'layout');
    return { ok: true };
  } catch (error: unknown) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Failed to update the feature flag',
    };
  }
}
