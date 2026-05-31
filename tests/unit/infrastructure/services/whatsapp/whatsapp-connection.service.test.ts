/**
 * WhatsAppConnectionService unit tests (spec 101)
 */

import 'reflect-metadata';
import { describe, it, expect, vi } from 'vitest';
import { WhatsAppConnectionService } from '@/infrastructure/services/whatsapp/whatsapp-connection.service.js';
import { WhatsAppMessageKind } from '@/application/use-cases/whatsapp/whatsapp-message.types.js';
import {
  WhatsAppAdapterKind,
  WhatsAppConnectionStatus,
  WhatsAppThreadTargetKind,
} from '@/domain/generated/output.js';
import type { WhatsAppInboundMessage } from '@/application/ports/output/services/whatsapp-gateway.interface.js';

function fakeGateway() {
  return {
    connect: vi.fn().mockResolvedValue(undefined),
    disconnect: vi.fn().mockResolvedValue(undefined),
    logout: vi.fn(),
    sendMessage: vi.fn().mockResolvedValue(undefined),
    onInbound: vi.fn(),
    getStatus: vi.fn().mockReturnValue(WhatsAppConnectionStatus.Connected),
    getConnectionInfo: vi.fn().mockReturnValue({ status: WhatsAppConnectionStatus.Connected }),
  };
}

function setup(settings: unknown) {
  const settingsRepository = { load: vi.fn().mockResolvedValue(settings) } as any;
  const baileys = fakeGateway();
  const cloudApi = fakeGateway();
  const dispatchUseCase = {
    execute: vi
      .fn()
      .mockResolvedValue({ message: { kind: WhatsAppMessageKind.DispatchedApplication } }),
  } as any;
  const routeReplyUseCase = {
    execute: vi
      .fn()
      .mockResolvedValue({ message: { kind: WhatsAppMessageKind.ReplyForwardedToSession } }),
  } as any;
  const threadMappings = {
    upsert: vi.fn(),
    findByThread: vi.fn().mockResolvedValue(null),
    findActiveByTarget: vi.fn(),
    deactivate: vi.fn(),
  } as any;
  const logger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() } as any;
  const service = new WhatsAppConnectionService(
    settingsRepository,
    baileys as any,
    cloudApi as any,
    dispatchUseCase,
    routeReplyUseCase,
    threadMappings,
    logger
  );
  return {
    service,
    settingsRepository,
    baileys,
    cloudApi,
    dispatchUseCase,
    routeReplyUseCase,
    threadMappings,
  };
}

const ENABLED = {
  featureFlags: { whatsappDispatch: true },
  whatsapp: { enabled: true, adapter: WhatsAppAdapterKind.Baileys },
  user: { preferredLanguage: 'en' },
};

const inbound: WhatsAppInboundMessage = {
  threadId: 't1',
  from: '+972500000000',
  text: 'hi',
  timestamp: 1,
};

describe('WhatsAppConnectionService', () => {
  describe('start', () => {
    it('does not start when the feature flag is off', async () => {
      const env = setup({
        featureFlags: { whatsappDispatch: false },
        whatsapp: { enabled: true, adapter: 'baileys' },
      });
      await env.service.start();
      expect(env.service.isRunning()).toBe(false);
      expect(env.baileys.connect).not.toHaveBeenCalled();
    });

    it('does not start when the integration is disabled', async () => {
      const env = setup({
        featureFlags: { whatsappDispatch: true },
        whatsapp: { enabled: false, adapter: 'baileys' },
      });
      await env.service.start();
      expect(env.service.isRunning()).toBe(false);
    });

    it('connects the Baileys adapter by default and is idempotent', async () => {
      const env = setup(ENABLED);
      await env.service.start();
      await env.service.start();
      expect(env.baileys.connect).toHaveBeenCalledTimes(1);
      expect(env.cloudApi.connect).not.toHaveBeenCalled();
      expect(env.service.isRunning()).toBe(true);
    });

    it('selects the Cloud API adapter when configured', async () => {
      const env = setup({
        ...ENABLED,
        whatsapp: { enabled: true, adapter: WhatsAppAdapterKind.CloudApi },
      });
      await env.service.start();
      expect(env.cloudApi.connect).toHaveBeenCalledTimes(1);
      expect(env.baileys.connect).not.toHaveBeenCalled();
    });

    it('stays not-running if connect throws', async () => {
      const env = setup(ENABLED);
      env.baileys.connect.mockRejectedValueOnce(new Error('socket fail'));
      await env.service.start();
      expect(env.service.isRunning()).toBe(false);
    });
  });

  describe('handleInbound', () => {
    it('dispatches a new thread (no active mapping) and replies', async () => {
      const env = setup(ENABLED);
      await env.service.start();
      await env.service.handleInbound(inbound);

      expect(env.dispatchUseCase.execute).toHaveBeenCalledWith(inbound);
      expect(env.routeReplyUseCase.execute).not.toHaveBeenCalled();
      expect(env.baileys.sendMessage).toHaveBeenCalledWith('t1', expect.any(String));
    });

    it('routes a reply when the thread has an active mapping', async () => {
      const env = setup(ENABLED);
      env.threadMappings.findByThread.mockResolvedValue({
        threadId: 't1',
        targetKind: WhatsAppThreadTargetKind.Application,
        targetId: 'app-1',
        active: true,
        createdAt: 1,
        updatedAt: 1,
      });
      await env.service.start();
      await env.service.handleInbound(inbound);

      expect(env.routeReplyUseCase.execute).toHaveBeenCalled();
      expect(env.dispatchUseCase.execute).not.toHaveBeenCalled();
      expect(env.baileys.sendMessage).toHaveBeenCalled();
    });

    it('dispatches when the mapping exists but is inactive', async () => {
      const env = setup(ENABLED);
      env.threadMappings.findByThread.mockResolvedValue({
        threadId: 't1',
        targetKind: WhatsAppThreadTargetKind.Application,
        targetId: 'app-1',
        active: false,
        createdAt: 1,
        updatedAt: 1,
      });
      await env.service.start();
      await env.service.handleInbound(inbound);
      expect(env.dispatchUseCase.execute).toHaveBeenCalled();
    });
  });

  describe('stop', () => {
    it('disconnects the gateway and clears running', async () => {
      const env = setup(ENABLED);
      await env.service.start();
      await env.service.stop();
      expect(env.baileys.disconnect).toHaveBeenCalled();
      expect(env.service.isRunning()).toBe(false);
    });
  });
});
