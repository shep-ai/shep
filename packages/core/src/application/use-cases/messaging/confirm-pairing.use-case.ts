/**
 * Confirm Messaging Pairing Use Case
 *
 * Finalizes a pairing handshake started by BeginMessagingPairingUseCase.
 * Marks the platform as paired, stores the chatId, and clears the pending
 * pairing code.
 *
 * When the caller supplies the code it received (the tunnel's `/pair <code>`
 * path), the code is verified here — against the pending code and its expiry
 * — in the same load/update as the confirmation, so a code is accepted at most
 * once and never after it expires.
 */

import { injectable, inject } from 'tsyringe';
import { MessagingPlatform, type Settings } from '../../../domain/generated/output.js';
import type { ISettingsRepository } from '../../ports/output/repositories/settings.repository.interface.js';

export interface ConfirmMessagingPairingInput {
  platform: MessagingPlatform;
  chatId: string;
  /** The pairing code presented by the user; verified when supplied. */
  code?: string;
}

export const INVALID_PAIRING_CODE_MESSAGE = 'Invalid or expired pairing code.';

/** `pendingPairingExpiresAt` is an ISO string when written, but may be revived as a Date. */
function isExpired(expiresAt: string | Date | undefined, now: number): boolean {
  if (!expiresAt) return false;
  const deadline = new Date(expiresAt).getTime();
  return Number.isFinite(deadline) && deadline <= now;
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

    if (
      input.code !== undefined &&
      (existingPlatform.pendingPairingCode !== input.code ||
        isExpired(existingPlatform.pendingPairingExpiresAt, Date.now()))
    ) {
      throw new Error(INVALID_PAIRING_CODE_MESSAGE);
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
