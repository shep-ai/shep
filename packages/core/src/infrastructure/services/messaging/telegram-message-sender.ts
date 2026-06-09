/**
 * Telegram Message Sender
 *
 * Concrete IMessageSender that delivers notifications to a paired Telegram
 * chat via the Telegram Bot API. Looks up the bot token + chat id from the
 * messaging config on every send so that pairing changes propagate without
 * restarting the daemon.
 *
 * This sender silently no-ops when Telegram is not paired — callers don't
 * need to guard individually.
 */

import type { IMessageSender } from '../../../application/ports/output/services/message-sender.interface.js';
import type { ITelegramClient } from '../../../application/ports/output/services/telegram-client.interface.js';
import type { MessagingNotification } from '../../../domain/generated/output.js';

export interface TelegramMessageSenderConfig {
  botToken: string;
  chatId: string;
}

export type TelegramConfigResolver = () => TelegramMessageSenderConfig | null;

function formatNotification(notification: MessagingNotification): string {
  const lines: string[] = [];
  if (notification.title) lines.push(`*${notification.title}*`);
  if (notification.message) lines.push(notification.message);
  if (notification.event && !notification.title) lines.push(`[${notification.event}]`);
  return lines.join('\n');
}

export class TelegramMessageSender implements IMessageSender {
  constructor(
    private readonly telegramClient: ITelegramClient,
    private readonly resolveConfig: TelegramConfigResolver
  ) {}

  async send(notification: MessagingNotification): Promise<void> {
    const config = this.resolveConfig();
    if (!config?.botToken || !config.chatId) return;

    const text = formatNotification(notification);
    if (!text.trim()) return;

    try {
      await this.telegramClient.sendMessage({
        botToken: config.botToken,
        chatId: config.chatId,
        text,
        parseMode: 'Markdown',
      });
    } catch {
      // Delivery failures are non-fatal — the daemon keeps running and
      // future notifications will retry on their own cadence.
    }
  }
}
