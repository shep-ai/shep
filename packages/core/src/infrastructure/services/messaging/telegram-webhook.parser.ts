/**
 * Telegram Webhook Parser
 *
 * Converts a raw Telegram `Update` object (posted to our webhook ingress URL)
 * into a domain-level ChatMessage that the messaging service can dispatch.
 *
 * Reference: https://core.telegram.org/bots/api#update
 *
 * We only care about the `message` variant for now — inline queries,
 * callback queries, edited messages, and channel posts are all ignored and
 * return `null`, which causes the tunnel adapter to reply 200 without
 * further side effects.
 */

export interface ParsedTelegramMessage {
  chatId: string;
  /** Telegram user ID of the sender. */
  senderId?: string;
  /** Username without leading @. */
  senderUsername?: string;
  text: string;
}

interface RawTelegramUpdate {
  update_id?: number;
  message?: {
    message_id?: number;
    chat?: { id?: number | string; username?: string };
    from?: { id?: number | string; username?: string };
    text?: string;
  };
}

export function parseTelegramUpdate(rawBody: string): ParsedTelegramMessage | null {
  if (!rawBody) return null;

  let update: RawTelegramUpdate;
  try {
    update = JSON.parse(rawBody) as RawTelegramUpdate;
  } catch {
    return null;
  }

  const message = update.message;
  if (!message) return null;

  const chatId = message.chat?.id !== undefined ? String(message.chat.id) : undefined;
  const text = typeof message.text === 'string' ? message.text : '';
  if (!chatId || !text) return null;

  return {
    chatId,
    senderId: message.from?.id !== undefined ? String(message.from.id) : undefined,
    senderUsername: message.from?.username,
    text,
  };
}

export interface PairCommand {
  code: string;
}

const PAIR_REGEX = /^\/pair(?:@\w+)?\s+(\d{6})\b/;

/** Match `/pair 123456` (with optional `@botname` suffix). */
export function parsePairCommand(text: string): PairCommand | null {
  const match = text.trim().match(PAIR_REGEX);
  if (!match) return null;
  return { code: match[1] };
}
