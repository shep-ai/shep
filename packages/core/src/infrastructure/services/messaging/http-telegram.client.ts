/**
 * HTTP Telegram Client
 *
 * Thin adapter over the Telegram Bot API for sending messages. Only
 * implements the surface needed for the remote control integration —
 * sendMessage, with optional parse_mode.
 *
 * Reference: https://core.telegram.org/bots/api#sendmessage
 */

import { injectable } from 'tsyringe';
import type {
  ITelegramClient,
  SendTelegramMessageInput,
} from '../../../application/ports/output/services/telegram-client.interface.js';

type FetchFn = typeof fetch;

const TELEGRAM_API_BASE = 'https://api.telegram.org';

@injectable()
export class HttpTelegramClient implements ITelegramClient {
  constructor(private readonly fetchImpl: FetchFn = fetch) {}

  async sendMessage(input: SendTelegramMessageInput): Promise<void> {
    if (!input.botToken) throw new Error('Telegram botToken is required');
    if (!input.chatId) throw new Error('Telegram chatId is required');

    const url = `${TELEGRAM_API_BASE}/bot${input.botToken}/sendMessage`;
    const body: Record<string, unknown> = {
      chat_id: input.chatId,
      text: input.text,
    };
    if (input.parseMode) body.parse_mode = input.parseMode;

    const response = await this.fetchImpl(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      let detail = '';
      try {
        const json = (await response.json()) as { description?: string };
        detail = json.description ?? '';
      } catch {
        // ignore
      }
      throw new Error(
        `Telegram sendMessage failed with ${response.status}${detail ? `: ${detail}` : ''}`
      );
    }
  }
}
