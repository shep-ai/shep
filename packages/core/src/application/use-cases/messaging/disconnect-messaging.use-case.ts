/**
 * Disconnect Messaging Use Case
 *
 * Disconnects either a single messaging platform (telegram/whatsapp) or all
 * platforms at once. When all platforms are cleared, the top-level messaging
 * feature is disabled so the daemon tears down the tunnel on next cycle.
 */

import { injectable, inject } from 'tsyringe';
import { MessagingPlatform, type Settings } from '../../../domain/generated/output.js';
import type { ISettingsRepository } from '../../ports/output/repositories/settings.repository.interface.js';

export interface DisconnectMessagingInput {
  /** If omitted, disconnect all platforms. */
  platform?: MessagingPlatform;
}

@injectable()
export class DisconnectMessagingUseCase {
  constructor(
    @inject('ISettingsRepository')
    private readonly settingsRepository: ISettingsRepository
  ) {}

  async execute(input: DisconnectMessagingInput = {}): Promise<Settings> {
    const settings = await this.settingsRepository.load();
    if (!settings) {
      throw new Error('Settings not found. Please run initialization first.');
    }

    const current = settings.messaging ?? {
      enabled: false,
      debounceMs: 5000,
      chatBufferMs: 3000,
    };

    if (!input.platform) {
      settings.messaging = {
        enabled: false,
        gatewayUrl: current.gatewayUrl,
        debounceMs: current.debounceMs ?? 5000,
        chatBufferMs: current.chatBufferMs ?? 3000,
      };
    } else {
      const platformKey: 'telegram' | 'whatsapp' =
        input.platform === MessagingPlatform.Telegram ? 'telegram' : 'whatsapp';
      const next = { ...current, [platformKey]: undefined };
      const otherKey: 'telegram' | 'whatsapp' =
        platformKey === 'telegram' ? 'whatsapp' : 'telegram';
      const otherStillEnabled = !!next[otherKey]?.enabled;
      settings.messaging = {
        ...next,
        enabled: otherStillEnabled,
      };
    }
    settings.updatedAt = new Date();

    await this.settingsRepository.update(settings);
    return settings;
  }
}
