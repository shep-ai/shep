'use server';

import { revalidatePath } from 'next/cache';
import { resolve } from '@/lib/server-container';
import type { BeginMessagingPairingUseCase } from '@shepai/core/application/use-cases/messaging/begin-pairing.use-case';
import type { ConfirmMessagingPairingUseCase } from '@shepai/core/application/use-cases/messaging/confirm-pairing.use-case';
import type { DisconnectMessagingUseCase } from '@shepai/core/application/use-cases/messaging/disconnect-messaging.use-case';
import type { LoadSettingsUseCase } from '@shepai/core/application/use-cases/settings/load-settings.use-case';
import { updateSettings as updateSettingsSingleton } from '@shepai/core/infrastructure/services/settings.service';
import type { MessagingPlatform } from '@shepai/core/domain/generated/output';

export interface BeginPairingResult {
  success: boolean;
  error?: string;
  session?: {
    platform: MessagingPlatform;
    code: string;
    expiresAt: string;
    gatewayUrl: string;
    publicUrl: string;
    routeId: string;
  };
}

export interface MessagingActionResult {
  success: boolean;
  error?: string;
}

async function refreshSettingsCache(): Promise<void> {
  // Keep the in-memory settings singleton in sync with the DB so that the
  // running daemon (started from the same process) sees the latest config.
  try {
    const loadUseCase = resolve<LoadSettingsUseCase>('LoadSettingsUseCase');
    const fresh = await loadUseCase.execute();
    updateSettingsSingleton(fresh);
  } catch {
    // Settings service may not be initialized yet in some contexts — ignore.
  }
}

export async function beginMessagingPairingAction(input: {
  platform: MessagingPlatform;
  gatewayUrl: string;
}): Promise<BeginPairingResult> {
  try {
    const useCase = resolve<BeginMessagingPairingUseCase>('BeginMessagingPairingUseCase');
    const session = await useCase.execute(input);
    await refreshSettingsCache();
    revalidatePath('/settings');
    return { success: true, session };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to begin pairing';
    return { success: false, error: message };
  }
}

export async function confirmMessagingPairingAction(input: {
  platform: MessagingPlatform;
  chatId: string;
}): Promise<MessagingActionResult> {
  try {
    const useCase = resolve<ConfirmMessagingPairingUseCase>('ConfirmMessagingPairingUseCase');
    await useCase.execute(input);
    await refreshSettingsCache();
    revalidatePath('/settings');
    return { success: true };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to confirm pairing';
    return { success: false, error: message };
  }
}

export async function disconnectMessagingAction(input: {
  platform?: MessagingPlatform;
}): Promise<MessagingActionResult> {
  try {
    const useCase = resolve<DisconnectMessagingUseCase>('DisconnectMessagingUseCase');
    await useCase.execute(input);
    await refreshSettingsCache();
    revalidatePath('/settings');
    return { success: true };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to disconnect messaging';
    return { success: false, error: message };
  }
}
