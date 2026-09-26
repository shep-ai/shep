'use server';

import { resolve } from '@/lib/server-container';
import {
  getSettings,
  resetSettings,
  initializeSettings,
} from '@shepai/core/infrastructure/services/settings.service';
import type { UpdateSettingsUseCase } from '@shepai/core/application/use-cases/settings/update-settings.use-case';

/**
 * Server action that updates the default LLM model in settings.
 *
 * Persists the new model to the database via UpdateSettingsUseCase and
 * refreshes the in-memory settings singleton so subsequent reads reflect
 * the change within the current server process.
 *
 * @param model - The model identifier to set as the new default
 * @returns `{ ok: true }` on success, or `{ ok: false, error: string }` on failure.
 */
export async function updateModel(model: string): Promise<{ ok: boolean; error?: string }> {
  if (!model.trim()) {
    return { ok: false, error: 'model is required' };
  }

  try {
    const currentSettings = getSettings();
    const updatedSettings = {
      ...currentSettings,
      models: { ...currentSettings.models, default: model.trim() },
    };

    const updateUseCase = resolve<UpdateSettingsUseCase>('UpdateSettingsUseCase');
    await updateUseCase.execute(updatedSettings);

    // Refresh the in-memory singleton so this server process sees the new value
    resetSettings();
    initializeSettings(updatedSettings);

    return { ok: true };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to update model';
    return { ok: false, error: message };
  }
}
