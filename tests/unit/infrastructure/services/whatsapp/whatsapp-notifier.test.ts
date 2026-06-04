/**
 * WhatsAppNotifier unit tests (spec 101, task-11)
 */

import 'reflect-metadata';
import { describe, it, expect, vi } from 'vitest';
import { WhatsAppNotifier } from '@/infrastructure/services/whatsapp/whatsapp-notifier.js';
import {
  NotificationEventType,
  NotificationSeverity,
  WhatsAppThreadTargetKind,
} from '@/domain/generated/output.js';
import type { NotificationEvent } from '@/domain/generated/output.js';

const ENABLED = {
  featureFlags: { whatsappDispatch: true },
  whatsapp: { enabled: true, adapter: 'baileys' },
  user: { preferredLanguage: 'en' },
};

function makeEvent(overrides?: Partial<NotificationEvent>): NotificationEvent {
  return {
    eventType: NotificationEventType.AgentCompleted,
    agentRunId: 'run-1',
    featureId: 'app-123',
    featureName: 'Todo App',
    message: 'done',
    severity: NotificationSeverity.Info,
    timestamp: new Date().toISOString(),
    ...overrides,
  } as NotificationEvent;
}

function setup(opts?: { settings?: unknown; mapping?: unknown; gateway?: unknown }) {
  const settingsRepository = {
    load: vi.fn().mockResolvedValue(opts?.settings ?? ENABLED),
  } as any;
  const sendMessage = vi.fn().mockResolvedValue(undefined);
  const gateway = opts && 'gateway' in opts ? opts.gateway : { sendMessage };
  const threadMappings = {
    findActiveByTarget: vi.fn().mockResolvedValue(
      'mapping' in (opts ?? {})
        ? opts!.mapping
        : {
            threadId: 'thread-1',
            targetKind: WhatsAppThreadTargetKind.Application,
            targetId: '123',
            active: true,
            createdAt: 1,
            updatedAt: 1,
          }
    ),
  } as any;
  const connectionService = { getActiveGateway: vi.fn().mockReturnValue(gateway) } as any;
  const logger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() } as any;
  const notifier = new WhatsAppNotifier(
    settingsRepository,
    threadMappings,
    connectionService,
    logger
  );
  return { notifier, settingsRepository, threadMappings, connectionService, logger, sendMessage };
}

// notify() is fire-and-forget; flush the microtask queue to let deliver() run.
const flush = () => new Promise((r) => setTimeout(r, 0));

describe('WhatsAppNotifier', () => {
  it('sends a localized message for a mapped application event', async () => {
    const env = setup();
    env.notifier.notify(makeEvent());
    await flush();

    expect(env.threadMappings.findActiveByTarget).toHaveBeenCalledWith(
      WhatsAppThreadTargetKind.Application,
      '123'
    );
    expect(env.sendMessage).toHaveBeenCalledTimes(1);
    const [threadId, text] = env.sendMessage.mock.calls[0];
    expect(threadId).toBe('thread-1');
    expect(text).toContain('Todo App');
  });

  it('resolves a feature target for a non-application featureId', async () => {
    const env = setup();
    env.notifier.notify(makeEvent({ featureId: 'feat-9' }));
    await flush();
    expect(env.threadMappings.findActiveByTarget).toHaveBeenCalledWith(
      WhatsAppThreadTargetKind.Feature,
      'feat-9'
    );
  });

  it('ignores event types outside the lifecycle subset', async () => {
    const env = setup();
    env.notifier.notify(makeEvent({ eventType: NotificationEventType.PrMerged }));
    await flush();
    expect(env.threadMappings.findActiveByTarget).not.toHaveBeenCalled();
    expect(env.sendMessage).not.toHaveBeenCalled();
  });

  it('does nothing when WhatsApp is disabled', async () => {
    const env = setup({
      settings: { featureFlags: { whatsappDispatch: false }, whatsapp: { enabled: true } },
    });
    env.notifier.notify(makeEvent());
    await flush();
    expect(env.sendMessage).not.toHaveBeenCalled();
  });

  it('does nothing when no thread is bound to the target', async () => {
    const env = setup({ mapping: null });
    env.notifier.notify(makeEvent());
    await flush();
    expect(env.sendMessage).not.toHaveBeenCalled();
  });

  it('does nothing when no gateway is connected', async () => {
    const env = setup({ gateway: null });
    env.notifier.notify(makeEvent());
    await flush();
    // findActiveByTarget runs, but there is no gateway to send through.
    expect(env.connectionService.getActiveGateway).toHaveBeenCalled();
  });

  it('swallows delivery errors (never throws)', async () => {
    const env = setup();
    env.sendMessage.mockRejectedValueOnce(new Error('socket down'));
    expect(() => env.notifier.notify(makeEvent())).not.toThrow();
    await flush();
    expect(env.logger.error).toHaveBeenCalled();
  });

  it('maps WaitingApproval to the needs-approval message', async () => {
    const env = setup();
    env.notifier.notify(makeEvent({ eventType: NotificationEventType.WaitingApproval }));
    await flush();
    const text = env.sendMessage.mock.calls[0][1];
    expect(text.toLowerCase()).toContain('approval');
  });
});
