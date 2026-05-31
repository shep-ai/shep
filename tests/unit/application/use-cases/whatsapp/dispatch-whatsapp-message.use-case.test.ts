/**
 * DispatchWhatsAppMessageUseCase unit tests (spec 101)
 */

import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DispatchWhatsAppMessageUseCase } from '@/application/use-cases/whatsapp/dispatch-whatsapp-message.use-case.js';
import { WhatsAppMessageKind } from '@/application/use-cases/whatsapp/whatsapp-message.types.js';
import { WhatsAppThreadTargetKind, WhatsAppAdapterKind } from '@/domain/generated/output.js';
import type { WhatsAppInboundMessage } from '@/application/ports/output/services/whatsapp-gateway.interface.js';

const ALLOWED_FROM = '+972500000000';

function makeSettings(overrides?: Record<string, unknown>) {
  return {
    whatsapp: {
      enabled: true,
      adapter: WhatsAppAdapterKind.Baileys,
      allowedNumbers: [ALLOWED_FROM],
    },
    ...overrides,
  };
}

function makeInbound(overrides?: Partial<WhatsAppInboundMessage>): WhatsAppInboundMessage {
  return {
    threadId: 'thread-1',
    from: ALLOWED_FROM,
    text: 'Build me a todo app',
    timestamp: Date.now(),
    ...overrides,
  };
}

function setup(settings: unknown) {
  const settingsRepository = { load: vi.fn().mockResolvedValue(settings) } as any;
  const createApplication = {
    execute: vi.fn().mockResolvedValue({
      application: { id: 'app-123' },
      repositoryPath: '/repos/todo',
    }),
  } as any;
  const threadMappings = {
    upsert: vi.fn().mockResolvedValue(undefined),
    findByThread: vi.fn(),
    findActiveByTarget: vi.fn(),
    deactivate: vi.fn(),
  } as any;
  const logger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() } as any;
  const useCase = new DispatchWhatsAppMessageUseCase(
    settingsRepository,
    createApplication,
    threadMappings,
    logger
  );
  return { useCase, settingsRepository, createApplication, threadMappings, logger };
}

describe('DispatchWhatsAppMessageUseCase', () => {
  let env: ReturnType<typeof setup>;
  beforeEach(() => {
    env = setup(makeSettings());
  });

  it('creates an application session and maps the thread for an authorized sender', async () => {
    const result = await env.useCase.execute(makeInbound());

    expect(env.createApplication.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        description: 'Build me a todo app',
        initialPrompt: 'Build me a todo app',
      })
    );
    expect(env.threadMappings.upsert).toHaveBeenCalledWith({
      threadId: 'thread-1',
      targetKind: WhatsAppThreadTargetKind.Application,
      targetId: 'app-123',
    });
    expect(result.applicationId).toBe('app-123');
    expect(result.message.kind).toBe(WhatsAppMessageKind.DispatchedApplication);
    expect(result.message.params?.title).toContain('todo app');
  });

  it('rejects an unauthorized sender without creating anything', async () => {
    const result = await env.useCase.execute(makeInbound({ from: '+10000000000' }));

    expect(env.createApplication.execute).not.toHaveBeenCalled();
    expect(env.threadMappings.upsert).not.toHaveBeenCalled();
    expect(result.message.kind).toBe(WhatsAppMessageKind.NotLinked);
  });

  it('rejects when the integration is disabled', async () => {
    env = setup(
      makeSettings({
        whatsapp: { enabled: false, adapter: 'baileys', allowedNumbers: [ALLOWED_FROM] },
      })
    );
    const result = await env.useCase.execute(makeInbound());
    expect(result.message.kind).toBe(WhatsAppMessageKind.NotLinked);
    expect(env.createApplication.execute).not.toHaveBeenCalled();
  });

  it('matches allowed numbers regardless of formatting', async () => {
    env = setup(
      makeSettings({
        whatsapp: { enabled: true, adapter: 'baileys', allowedNumbers: ['972-50-000-0000'] },
      })
    );
    const result = await env.useCase.execute(makeInbound({ from: '+972 50 000 0000' }));
    expect(result.message.kind).toBe(WhatsAppMessageKind.DispatchedApplication);
  });

  it('returns UnknownCommand for an empty message', async () => {
    const result = await env.useCase.execute(makeInbound({ text: '   ' }));
    expect(result.message.kind).toBe(WhatsAppMessageKind.UnknownCommand);
    expect(env.createApplication.execute).not.toHaveBeenCalled();
  });

  it('returns an Error outcome when application creation throws', async () => {
    env.createApplication.execute.mockRejectedValueOnce(new Error('scaffold failed'));
    const result = await env.useCase.execute(makeInbound());
    expect(result.message.kind).toBe(WhatsAppMessageKind.Error);
    expect(result.message.params?.detail).toBe('scaffold failed');
    expect(env.threadMappings.upsert).not.toHaveBeenCalled();
  });

  it('rejects when whatsapp config is absent', async () => {
    env = setup({});
    const result = await env.useCase.execute(makeInbound());
    expect(result.message.kind).toBe(WhatsAppMessageKind.NotLinked);
  });
});
