/**
 * ConfirmMessagingPairingUseCase Unit Tests
 *
 * TDD Phase: RED — tests written before implementation.
 */

import 'reflect-metadata';
import { describe, it, expect, beforeEach } from 'vitest';
import { ConfirmMessagingPairingUseCase } from '@/application/use-cases/messaging/confirm-pairing.use-case.js';
import { MockSettingsRepository } from '../../../../helpers/mock-repository.helper.js';
import { createDefaultSettings } from '@/domain/factories/settings-defaults.factory.js';
import { MessagingPlatform, type Settings } from '@/domain/generated/output.js';

function settingsWithPendingCode(platform: 'telegram' | 'whatsapp', code: string): Settings {
  const settings = createDefaultSettings();
  settings.messaging = {
    enabled: true,
    gatewayUrl: 'https://gateway.example.com',
    debounceMs: 5000,
    chatBufferMs: 3000,
    [platform]: {
      enabled: true,
      paired: false,
      pendingPairingCode: code,
    },
  };
  return settings;
}

describe('ConfirmMessagingPairingUseCase', () => {
  let useCase: ConfirmMessagingPairingUseCase;
  let mockRepository: MockSettingsRepository;

  beforeEach(() => {
    mockRepository = new MockSettingsRepository();
    useCase = new ConfirmMessagingPairingUseCase(mockRepository as never);
  });

  it('marks the platform as paired and stores the chatId', async () => {
    await mockRepository.initialize(settingsWithPendingCode('telegram', '123456'));

    const result = await useCase.execute({
      platform: MessagingPlatform.Telegram,
      chatId: '@alice',
    });

    expect(result.messaging?.telegram?.paired).toBe(true);
    expect(result.messaging?.telegram?.chatId).toBe('@alice');
    expect(result.messaging?.telegram?.pendingPairingCode).toBeUndefined();
  });

  it('fails when pairing was never started for the platform', async () => {
    await mockRepository.initialize(createDefaultSettings());
    await expect(
      useCase.execute({ platform: MessagingPlatform.Telegram, chatId: '@alice' })
    ).rejects.toThrow(/no pairing in progress/i);
  });

  it('requires a non-empty chatId', async () => {
    await mockRepository.initialize(settingsWithPendingCode('whatsapp', '999999'));
    await expect(
      useCase.execute({ platform: MessagingPlatform.WhatsApp, chatId: '' })
    ).rejects.toThrow(/chat id/i);
  });

  it('leaves the other platform untouched', async () => {
    const settings = settingsWithPendingCode('telegram', '111111');
    settings.messaging!.whatsapp = { enabled: false, paired: false };
    await mockRepository.initialize(settings);

    const result = await useCase.execute({
      platform: MessagingPlatform.Telegram,
      chatId: '@bob',
    });

    expect(result.messaging?.telegram?.paired).toBe(true);
    expect(result.messaging?.whatsapp?.paired).toBe(false);
    expect(result.messaging?.whatsapp?.enabled).toBe(false);
  });
});
