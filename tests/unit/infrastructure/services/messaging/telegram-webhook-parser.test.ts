import { describe, it, expect } from 'vitest';
import {
  parseTelegramUpdate,
  parsePairCommand,
} from '@/infrastructure/services/messaging/telegram-webhook.parser.js';

describe('parseTelegramUpdate', () => {
  it('extracts chatId and text from a standard message update', () => {
    const raw = JSON.stringify({
      update_id: 1,
      message: {
        message_id: 10,
        chat: { id: 12345, username: 'alice' },
        from: { id: 99, username: 'alice' },
        text: '/status',
      },
    });
    const parsed = parseTelegramUpdate(raw);
    expect(parsed).toEqual({
      chatId: '12345',
      senderId: '99',
      senderUsername: 'alice',
      text: '/status',
    });
  });

  it('returns null for non-message updates', () => {
    expect(parseTelegramUpdate(JSON.stringify({ update_id: 2, edited_message: {} }))).toBeNull();
    expect(parseTelegramUpdate(JSON.stringify({ update_id: 3, callback_query: {} }))).toBeNull();
  });

  it('returns null when message has no text (e.g. photo-only)', () => {
    expect(parseTelegramUpdate(JSON.stringify({ message: { chat: { id: 1 } } }))).toBeNull();
  });

  it('returns null for malformed JSON', () => {
    expect(parseTelegramUpdate('not json')).toBeNull();
    expect(parseTelegramUpdate('')).toBeNull();
  });

  it('stringifies numeric chat ids', () => {
    const parsed = parseTelegramUpdate(
      JSON.stringify({ message: { chat: { id: -100123 }, text: 'hi' } })
    );
    expect(parsed?.chatId).toBe('-100123');
  });
});

describe('parsePairCommand', () => {
  it('matches `/pair 123456`', () => {
    expect(parsePairCommand('/pair 123456')).toEqual({ code: '123456' });
  });

  it('matches `/pair@BotName 654321`', () => {
    expect(parsePairCommand('/pair@ShepBot 654321')).toEqual({ code: '654321' });
  });

  it('returns null for non-pair commands', () => {
    expect(parsePairCommand('/status')).toBeNull();
    expect(parsePairCommand('hello')).toBeNull();
  });

  it('requires exactly 6 digits', () => {
    expect(parsePairCommand('/pair 12345')).toBeNull();
    expect(parsePairCommand('/pair 1234567')).toBeNull();
  });

  it('ignores leading/trailing whitespace', () => {
    expect(parsePairCommand('  /pair 111111  ')).toEqual({ code: '111111' });
  });
});
