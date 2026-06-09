/**
 * Confirm Messaging Pairing Use Case
 *
 * Finalizes a pairing handshake started by BeginMessagingPairingUseCase.
 * Marks the platform as paired, stores the chatId, and clears the pending
 * pairing code.
 */

import { injectable, inject } from 'tsyringe';
import { MessagingPlatform, type Settings } from '../../../domain/generated/output.js';
import type { ISettingsRepository } from '../../ports/output/repositories/settings.repository.interface.js';

export interface ConfirmMessagingPairingInput {
  platform: MessagingPlatform;
  chatId: string;
}

@injectable()
export class ConfirmMessagingPairingUseCase {
  constructor(
    @inject('ISettingsRepository')
    private readonly settingsRepository: ISettingsRepository
  ) {}

  async execute(input: ConfirmMessagingPairingInput): Promise<Settings> {
    if (!input.chatId?.trim()) {
      throw new Error('Chat ID is required to confirm pairing.');
    }

    const settings = await this.settingsRepository.load();
    if (!settings) {
      throw new Error('Settings not found. Please run initialization first.');
    }

    const platformKey: 'telegram' | 'whatsapp' =
      input.platform === MessagingPlatform.Telegram ? 'telegram' : 'whatsapp';

    const messaging = settings.messaging;
    const existingPlatform = messaging?.[platformKey];

    if (!messaging || !existingPlatform?.pendingPairingCode) {
      throw new Error(`No pairing in progress for ${platformKey}.`);
    }

    settings.messaging = {
      ...messaging,
      enabled: true,
      [platformKey]: {
        ...existingPlatform,
        enabled: true,
        paired: true,
        chatId: input.chatId.trim(),
        pendingPairingCode: undefined,
        pendingPairingExpiresAt: undefined,
      },
    };
    settings.updatedAt = new Date();

    await this.settingsRepository.update(settings);
    return settings;
  }
}
