/**
 * WhatsAppBaileysGateway unit tests (spec 101)
 *
 * The real @whiskeysockets/baileys package is intentionally NOT installed, so
 * connect() must surface the actionable install hint. The pure mapping helpers
 * are tested directly.
 */

import 'reflect-metadata';
import { describe, it, expect, vi } from 'vitest';
import {
  WhatsAppBaileysGateway,
  BaileysNotInstalledError,
  mapBaileysMessage,
  normalizeJidToNumber,
} from '@/infrastructure/services/whatsapp/whatsapp-baileys.gateway.js';
import { WhatsAppConnectionStatus } from '@/domain/generated/output.js';

function makeGateway() {
  const logger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() } as any;
  return new WhatsAppBaileysGateway(logger);
}

describe('WhatsAppBaileysGateway', () => {
  it('throws an actionable error from connect() when the package is missing', async () => {
    const gw = makeGateway();
    await expect(gw.connect()).rejects.toBeInstanceOf(BaileysNotInstalledError);
    await expect(gw.connect()).rejects.toThrow(/pnpm add @whiskeysockets\/baileys/);
  });

  it('starts Disconnected and throws when sending while not connected', async () => {
    const gw = makeGateway();
    expect(gw.getStatus()).toBe(WhatsAppConnectionStatus.Disconnected);
    await expect(gw.sendMessage('jid', 'hi')).rejects.toThrow(/not connected/);
  });

  it('reports a status snapshot', () => {
    const gw = makeGateway();
    expect(gw.getConnectionInfo()).toEqual({ status: WhatsAppConnectionStatus.Disconnected });
  });
});

describe('normalizeJidToNumber', () => {
  it('extracts the E.164 number from a JID', () => {
    expect(normalizeJidToNumber('972500000000@s.whatsapp.net')).toBe('+972500000000');
    expect(normalizeJidToNumber('972500000000:12@s.whatsapp.net')).toBe('+972500000000');
  });
  it('returns undefined for empty input', () => {
    expect(normalizeJidToNumber(undefined)).toBeUndefined();
    expect(normalizeJidToNumber('')).toBeUndefined();
  });
});

describe('mapBaileysMessage', () => {
  it('maps a plain conversation message', () => {
    const mapped = mapBaileysMessage({
      key: { remoteJid: '972500000000@s.whatsapp.net', fromMe: false },
      message: { conversation: 'hello' },
      messageTimestamp: 1700000000,
    });
    expect(mapped).toEqual({
      threadId: '972500000000@s.whatsapp.net',
      from: '+972500000000',
      text: 'hello',
      timestamp: 1700000000 * 1000,
    });
  });

  it('maps an extendedTextMessage', () => {
    const mapped = mapBaileysMessage({
      key: { remoteJid: '972500000000@s.whatsapp.net' },
      message: { extendedTextMessage: { text: 'world' } },
    });
    expect(mapped?.text).toBe('world');
  });

  it('handles a Long-like timestamp with toNumber()', () => {
    const mapped = mapBaileysMessage({
      key: { remoteJid: '1@s.whatsapp.net' },
      message: { conversation: 'x' },
      messageTimestamp: { toNumber: () => 1700000001 },
    });
    expect(mapped?.timestamp).toBe(1700000001 * 1000);
  });

  it('ignores messages sent by us (fromMe)', () => {
    expect(
      mapBaileysMessage({
        key: { remoteJid: 'x@s.whatsapp.net', fromMe: true },
        message: { conversation: 'hi' },
      })
    ).toBeNull();
  });

  it('ignores messages with no text body or no sender', () => {
    expect(mapBaileysMessage({ key: { remoteJid: 'x@s.whatsapp.net' }, message: {} })).toBeNull();
    expect(mapBaileysMessage({ key: {}, message: { conversation: 'hi' } })).toBeNull();
    expect(
      mapBaileysMessage({
        key: { remoteJid: 'x@s.whatsapp.net' },
        message: { conversation: '   ' },
      })
    ).toBeNull();
  });
});
