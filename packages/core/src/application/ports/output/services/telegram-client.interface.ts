/**
 * Telegram Bot API Client Interface
 *
 * Output port for making outbound calls to api.telegram.org. Used by the
 * messaging service to reply to users after processing a webhook, and to
 * push debounced notifications from the daemon.
 */

export interface SendTelegramMessageInput {
  /** Bot token (e.g. `123456:ABCDEF-...`). */
  botToken: string;
  chatId: string;
  text: string;
  /** Optional parse mode (`Markdown`, `MarkdownV2`, `HTML`). */
  parseMode?: 'Markdown' | 'MarkdownV2' | 'HTML';
}

export interface ITelegramClient {
  sendMessage(input: SendTelegramMessageInput): Promise<void>;
}
