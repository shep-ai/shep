import { describe, it, expect } from 'vitest';
import { parseWhatsAppUpdate } from '@/infrastructure/services/messaging/whatsapp-webhook.parser.js';

function textUpdate(from: string, body: string): string {
  return JSON.stringify({
    object: 'whatsapp_business_account',
    entry: [
      {
        id: 'biz-1',
        changes: [
          {
            value: {
              messages: [
                {
                  from,
                  id: 'wamid.abc',
                  timestamp: '1700000000',
                  type: 'text',
                  text: { body },
                },
              ],
            },
          },
        ],
      },
    ],
  });
}

describe('parseWhatsAppUpdate', () => {
  it('extracts from + text from a standard text message', () => {
    const parsed = parseWhatsAppUpdate(textUpdate('15551234567', 'hello'));
    expect(parsed).toEqual({
      chatId: '15551234567',
      senderId: '15551234567',
      text: 'hello',
    });
  });

  it('returns null for non-text message types', () => {
    const raw = JSON.stringify({
      object: 'whatsapp_business_account',
      entry: [
        {
          changes: [
            {
              value: {
                messages: [{ from: '1', type: 'image', image: { id: 'media1' } }],
              },
            },
          ],
        },
      ],
    });
    expect(parseWhatsAppUpdate(raw)).toBeNull();
  });

  it('returns null for status-only payloads (no messages)', () => {
    const raw = JSON.stringify({
      object: 'whatsapp_business_account',
      entry: [
        {
          changes: [
            {
              value: {
                statuses: [{ id: 'wamid.xxx', status: 'delivered' }],
              },
            },
          ],
        },
      ],
    });
    expect(parseWhatsAppUpdate(raw)).toBeNull();
  });

  it('returns null for malformed JSON', () => {
    expect(parseWhatsAppUpdate('not json')).toBeNull();
    expect(parseWhatsAppUpdate('')).toBeNull();
  });

  it('returns null when text body is missing', () => {
    const raw = JSON.stringify({
      entry: [
        {
          changes: [
            {
              value: {
                messages: [{ from: '1', type: 'text', text: {} }],
              },
            },
          ],
        },
      ],
    });
    expect(parseWhatsAppUpdate(raw)).toBeNull();
  });
});
