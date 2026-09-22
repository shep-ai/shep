/**
 * MessagingService Unit Tests
 *
 * Covers the config lifetime: the service must read the CURRENT messaging
 * settings at use time, not a snapshot taken when the daemon booted. A
 * pairing confirmed (or begun, from another process) after start() must be
 * visible to the next notification and the next inbound /pair message, and a
 * pairing code must not be accepted twice.
 */

import 'reflect-metadata';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import type { DecodedTunnelRequest } from '@/infrastructure/services/messaging/tunnel-protocol.js';

const tunnel = vi.hoisted(() => ({
  handler: null as null | ((req: unknown) => Promise<{ status: number }>),
  deps: null as null | { getAccessToken: () => Promise<string>; routeIds: string[] },
}));

vi.mock('@/infrastructure/services/messaging/messaging-tunnel.adapter.js', () => ({
  MessagingTunnelAdapter: class {
    constructor(deps: { getAccessToken: () => Promise<string>; routeIds: string[] }) {
      tunnel.deps = deps;
    }
    onRequest(handler: (req: unknown) => Promise<{ status: number }>) {
      tunnel.handler = handler;
    }
    async connect() {
      /* connected */
    }
    async disconnect() {
      /* closed */
    }
    isConnected() {
      return true;
    }
  },
}));

import { MessagingService } from '@/infrastructure/services/messaging/messaging.service.js';
import { ConfirmMessagingPairingUseCase } from '@/application/use-cases/messaging/confirm-pairing.use-case.js';
import { MockSettingsRepository } from '../../../../helpers/mock-repository.helper.js';
import { createDefaultSettings } from '@/domain/factories/settings-defaults.factory.js';
import type { MessagingConfig } from '@/domain/generated/output.js';
import type { NotificationBus } from '@/infrastructure/services/notifications/notification-bus.js';

const ROUTE_ID = 'route-telegram';
const CHAT_ID = '4242';
const PAIRING_CODE = '123456';
const BOT_TOKEN = 'bot-token';
const PAIRING_TTL_MS = 10 * 60 * 1000;

function pendingConfig(code: string): MessagingConfig {
  return {
    enabled: true,
    gatewayUrl: 'https://gateway.example.com',
    deviceId: 'dev-1',
    debounceMs: 0,
    chatBufferMs: 0,
    telegram: {
      enabled: true,
      paired: false,
      routeId: ROUTE_ID,
      botToken: BOT_TOKEN,
      pendingPairingCode: code,
      pendingPairingExpiresAt: new Date(Date.now() + PAIRING_TTL_MS).toISOString(),
    },
  };
}

function pairRequest(code: string): DecodedTunnelRequest {
  return {
    requestId: 'req',
    routeId: ROUTE_ID,
    method: 'POST',
    path: '/',
    headers: {},
    body: JSON.stringify({ message: { chat: { id: Number(CHAT_ID) }, text: `/pair ${code}` } }),
  };
}

describe('MessagingService — live messaging config', () => {
  let repo: MockSettingsRepository;
  let confirmPairing: ConfirmMessagingPairingUseCase;
  let sendMessage: ReturnType<typeof vi.fn>;
  let service: MessagingService;

  async function writeMessaging(config: MessagingConfig): Promise<void> {
    const settings = (await repo.load()) ?? createDefaultSettings();
    settings.messaging = config;
    await repo.update(settings);
  }

  beforeEach(async () => {
    tunnel.handler = null;
    tunnel.deps = null;
    repo = new MockSettingsRepository();
    await repo.initialize(createDefaultSettings());
    await writeMessaging(pendingConfig(PAIRING_CODE));
    confirmPairing = new ConfirmMessagingPairingUseCase(repo as never);
    sendMessage = vi.fn().mockResolvedValue(undefined);

    service = new MessagingService({
      loadConfig: async () => (await repo.load())?.messaging,
      gatewayClient: {
        fetchAccessToken: async () => ({ accessToken: 'tok', tokenType: 'Bearer', expiresAt: 0 }),
        createIntegrationRoute: vi.fn(),
      },
      telegramClient: { sendMessage } as never,
      notificationBus: new EventEmitter() as NotificationBus,
      featureRepo: {} as never,
      createFeature: {} as never,
      approveAgentRun: {} as never,
      rejectAgentRun: {} as never,
      stopAgentRun: {} as never,
      resumeFeature: {} as never,
      listFeatures: {} as never,
      showFeature: {} as never,
      listRepositories: {} as never,
      confirmPairing,
      interactiveSessionService: {} as never,
    });
    await service.start();
  });

  afterEach(async () => {
    await service.stop();
  });

  it('delivers notifications to the chat paired after start() without a restart', async () => {
    await tunnel.handler!(pairRequest(PAIRING_CODE));
    sendMessage.mockClear();

    await service.sendNotification({
      event: 'agent_completed',
      featureId: 'feat-1',
      title: 'Done',
      message: 'ok',
    });

    expect(sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ chatId: CHAT_ID, botToken: BOT_TOKEN })
    );
  });

  it('rejects the pairing code once it has been used', async () => {
    const executeSpy = vi.spyOn(confirmPairing, 'execute');
    await tunnel.handler!(pairRequest(PAIRING_CODE));
    expect(executeSpy).toHaveBeenCalledTimes(1);
    sendMessage.mockClear();

    await tunnel.handler!(pairRequest(PAIRING_CODE));

    expect(sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ text: expect.stringMatching(/invalid or expired/i) })
    );
    expect((await repo.load())?.messaging?.telegram?.chatId).toBe(CHAT_ID);
    expect(sendMessage).not.toHaveBeenCalledWith(
      expect.objectContaining({ text: expect.stringMatching(/^Paired/) })
    );
  });

  it('accepts a pairing code written after start() (e.g. by the CLI in another process)', async () => {
    const freshCode = '654321';
    await writeMessaging(pendingConfig(freshCode));

    await tunnel.handler!(pairRequest(freshCode));

    const saved = (await repo.load())?.messaging?.telegram;
    expect(saved?.paired).toBe(true);
    expect(saved?.chatId).toBe(CHAT_ID);
  });

  it('passes a token provider to the tunnel instead of a fixed token', async () => {
    expect(tunnel.deps?.routeIds).toEqual([ROUTE_ID]);
    await expect(tunnel.deps!.getAccessToken()).resolves.toBe('tok');
  });
});
