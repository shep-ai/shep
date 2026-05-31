/**
 * WhatsAppCloudApiGateway unit tests (spec 101)
 */

import 'reflect-metadata';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { createHmac } from 'node:crypto';
import {
  WhatsAppCloudApiGateway,
  parseCloudApiMessages,
} from '@/infrastructure/services/whatsapp/whatsapp-cloud-api.gateway.js';
import { WhatsAppConnectionStatus, WhatsAppAdapterKind } from '@/domain/generated/output.js';

function makeGateway(whatsapp: unknown) {
  const settingsRepository = { load: vi.fn().mockResolvedValue({ whatsapp }) } as any;
  const logger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() } as any;
  return new WhatsAppCloudApiGateway(settingsRepository, logger);
}

const FULL_CONFIG = {
  enabled: true,
  adapter: WhatsAppAdapterKind.CloudApi,
  cloudApiPhoneNumberId: 'pn-1',
  cloudApiAccessToken: 'tok-1',
  cloudApiVerifyToken: 'verify-1',
  cloudApiAppSecret: 'secret-1',
};

describe('WhatsAppCloudApiGateway', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('connect', () => {
    it('connects when credentials are present', async () => {
      const gw = makeGateway(FULL_CONFIG);
      await gw.connect();
      expect(gw.getStatus()).toBe(WhatsAppConnectionStatus.Connected);
    });

    it('errors when credentials are missing', async () => {
      const gw = makeGateway({ enabled: true, adapter: WhatsAppAdapterKind.CloudApi });
      await gw.connect();
      expect(gw.getStatus()).toBe(WhatsAppConnectionStatus.Error);
    });
  });

  describe('sendMessage', () => {
    it('POSTs a text message to the Graph API with the right shape', async () => {
      const fetchMock = vi.fn().mockResolvedValue({ ok: true, text: async () => '' });
      vi.stubGlobal('fetch', fetchMock);

      const gw = makeGateway(FULL_CONFIG);
      await gw.sendMessage('972500000000', 'hello');

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe('https://graph.facebook.com/v21.0/pn-1/messages');
      expect(init.method).toBe('POST');
      expect(init.headers.Authorization).toBe('Bearer tok-1');
      const body = JSON.parse(init.body);
      expect(body).toMatchObject({
        messaging_product: 'whatsapp',
        to: '972500000000',
        type: 'text',
        text: { body: 'hello' },
      });
    });

    it('throws on a non-ok response', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({ ok: false, status: 401, text: async () => 'unauthorized' })
      );
      const gw = makeGateway(FULL_CONFIG);
      await expect(gw.sendMessage('x', 'y')).rejects.toThrow(/401/);
    });

    it('throws when not configured', async () => {
      const gw = makeGateway({ enabled: true, adapter: WhatsAppAdapterKind.CloudApi });
      await expect(gw.sendMessage('x', 'y')).rejects.toThrow(/not configured/);
    });
  });

  describe('verifyWebhook', () => {
    it('echoes the challenge on a matching subscribe handshake', () => {
      const gw = makeGateway(FULL_CONFIG);
      expect(gw.verifyWebhook('subscribe', 'verify-1', 'CHAL', 'verify-1')).toBe('CHAL');
    });
    it('rejects a token mismatch', () => {
      const gw = makeGateway(FULL_CONFIG);
      expect(gw.verifyWebhook('subscribe', 'wrong', 'CHAL', 'verify-1')).toBeNull();
    });
  });

  describe('verifySignature', () => {
    it('accepts a correct HMAC-SHA256 signature', () => {
      const gw = makeGateway(FULL_CONFIG);
      const body = '{"hello":"world"}';
      const sig = `sha256=${createHmac('sha256', 'secret-1').update(body).digest('hex')}`;
      expect(gw.verifySignature(body, sig, 'secret-1')).toBe(true);
    });
    it('rejects a wrong signature and a missing header', () => {
      const gw = makeGateway(FULL_CONFIG);
      expect(gw.verifySignature('{}', 'sha256=deadbeef', 'secret-1')).toBe(false);
      expect(gw.verifySignature('{}', undefined, 'secret-1')).toBe(false);
    });
  });

  describe('handleWebhook / parseCloudApiMessages', () => {
    const payload = {
      entry: [
        {
          changes: [
            {
              value: {
                messages: [
                  {
                    from: '972500000000',
                    type: 'text',
                    text: { body: 'hi' },
                    timestamp: '1700000000',
                  },
                  { from: '972500000001', type: 'image' }, // ignored (not text)
                ],
              },
            },
          ],
        },
      ],
    };

    it('parses only text messages, normalizing the sender to E.164', () => {
      const msgs = parseCloudApiMessages(payload);
      expect(msgs).toHaveLength(1);
      expect(msgs[0]).toMatchObject({
        threadId: '972500000000',
        from: '+972500000000',
        text: 'hi',
        timestamp: 1700000000 * 1000,
      });
    });

    it('returns [] for a non-message payload', () => {
      expect(parseCloudApiMessages({ entry: [{ changes: [{ value: {} }] }] })).toEqual([]);
      expect(parseCloudApiMessages({})).toEqual([]);
    });

    it('dispatches parsed messages to registered handlers', async () => {
      const gw = makeGateway(FULL_CONFIG);
      const handler = vi.fn();
      gw.onInbound(handler);
      const msgs = await gw.handleWebhook(payload);
      expect(msgs).toHaveLength(1);
      expect(handler).toHaveBeenCalledWith(expect.objectContaining({ text: 'hi' }));
    });

    it('isolates handler errors', async () => {
      const gw = makeGateway(FULL_CONFIG);
      gw.onInbound(() => {
        throw new Error('boom');
      });
      await expect(gw.handleWebhook(payload)).resolves.toHaveLength(1);
    });
  });
});
