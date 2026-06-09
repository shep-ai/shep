'use server';

import { revalidatePath } from 'next/cache';
import { resolve } from '@/lib/server-container';
import type { LoadSettingsUseCase } from '@shepai/core/application/use-cases/settings/load-settings.use-case';
import type { UpdateSettingsUseCase } from '@shepai/core/application/use-cases/settings/update-settings.use-case';
import { updateSettings as updateSettingsSingleton } from '@shepai/core/infrastructure/services/settings.service';
import type {
  GetSecurityStateUseCase,
  SecurityState,
} from '@shepai/core/application/use-cases/security/get-security-state.use-case';
import type {
  EnforceSecurityUseCase,
  EnforceSecurityResult,
} from '@shepai/core/application/use-cases/security/enforce-security.use-case';
import type { SecurityMode } from '@shepai/core/domain/generated/output';

export interface GetSecurityStateResult {
  state?: SecurityState;
  error?: string;
}

export interface EnforceSecurityActionResult {
  result?: EnforceSecurityResult;
  error?: string;
}

export interface UpdateSecurityModeResult {
  success: boolean;
  error?: string;
}

/**
 * Fetches the current security state for a repository.
 */
export async function getSecurityStateAction(
  repositoryPath: string
): Promise<GetSecurityStateResult> {
  try {
    const useCase = resolve<GetSecurityStateUseCase>('GetSecurityStateUseCase');
    const state = await useCase.execute(repositoryPath);
    return { state };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to load security state';
    return { error: message };
  }
}

/**
 * Runs the full security enforcement flow for a repository.
 */
export async function enforceSecurityAction(
  repositoryPath: string
): Promise<EnforceSecurityActionResult> {
  try {
    const useCase = resolve<EnforceSecurityUseCase>('EnforceSecurityUseCase');
    const result = await useCase.execute({ repositoryPath });
    revalidatePath('/', 'layout');
    return { result };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to run security enforcement';
    return { error: message };
  }
}

/**
 * Updates the security mode in settings.
 */
export async function updateSecurityModeAction(
  mode: SecurityMode
): Promise<UpdateSecurityModeResult> {
  try {
    const loadUseCase = resolve<LoadSettingsUseCase>('LoadSettingsUseCase');
    const current = await loadUseCase.execute();

    const merged = {
      ...current,
      security: {
        ...current.security,
        mode,
      },
      updatedAt: new Date(),
    };

    const updateUseCase = resolve<UpdateSettingsUseCase>('UpdateSettingsUseCase');
    await updateUseCase.execute(merged);

    updateSettingsSingleton(merged);
    revalidatePath('/', 'layout');

    return { success: true };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to update security mode';
    return { success: false, error: message };
  }
}
