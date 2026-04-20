/**
 * StreamAgentEventsUseCase — Operation-log bus subscription tests.
 *
 * Verifies that:
 *   1. A publish on the bus while the generator is awaiting the next poll
 *      tick is re-emitted as an `OperationLogAppended` notification carrying
 *      the full entry payload.
 *   2. The subscription is torn down on signal abort.
 */

import 'reflect-metadata';
import { describe, it, expect, vi } from 'vitest';

import { StreamAgentEventsUseCase } from '@/application/use-cases/agents/stream-agent-events.use-case.js';
import type { ListFeaturesUseCase } from '@/application/use-cases/features/list-features.use-case.js';
import type { IAgentRunRepository } from '@/application/ports/output/agents/agent-run-repository.interface.js';
import type { IPhaseTimingRepository } from '@/application/ports/output/agents/phase-timing-repository.interface.js';
import type { IApplicationRepository } from '@/application/ports/output/repositories/application-repository.interface.js';
import type { IInteractiveSessionRepository } from '@/application/ports/output/repositories/interactive-session-repository.interface.js';
import type { ICloudDeploymentEventBus } from '@/application/ports/output/services/cloud-deployment-event-bus.interface.js';
import type { ILogger } from '@/application/ports/output/services/logger.interface.js';
import type { IProcessLivenessProbe } from '@/application/ports/output/services/process-liveness.interface.js';

import { InMemoryOperationLogEventBus } from '@/infrastructure/services/events/in-memory-operation-log-event-bus.js';

import type { NotificationEvent, OperationLogEntry } from '@/domain/generated/output.js';
import {
  NotificationEventType,
  NotificationSeverity,
  OperationLogKind,
  OperationLogLevel,
} from '@/domain/generated/output.js';

function buildUseCase(bus: InMemoryOperationLogEventBus): StreamAgentEventsUseCase {
  const listFeaturesStub = {
    execute: vi.fn().mockResolvedValue([]),
  } as unknown as ListFeaturesUseCase;

  const agentRunRepo: IAgentRunRepository = {
    create: vi.fn(),
    findById: vi.fn().mockResolvedValue(null),
    findByThreadId: vi.fn(),
    updateStatus: vi.fn(),
    updatePinnedConfig: vi.fn(),
    findRunningByPid: vi.fn(),
    list: vi.fn().mockResolvedValue([]),
    delete: vi.fn(),
  };

  const phaseTimingRepo: IPhaseTimingRepository = {
    save: vi.fn(),
    update: vi.fn(),
    updateApprovalWait: vi.fn(),
    findByRunId: vi.fn().mockResolvedValue([]),
    findByFeatureId: vi.fn().mockResolvedValue([]),
  };

  const sessionRepo: IInteractiveSessionRepository = {
    create: vi.fn(),
    findById: vi.fn().mockResolvedValue(null),
    findByFeatureId: vi.fn().mockResolvedValue(null),
    findAllActive: vi.fn().mockResolvedValue([]),
    updateStatus: vi.fn(),
    updateLastActivity: vi.fn(),
    markAllActiveStopped: vi.fn(),
    countActiveSessions: vi.fn().mockResolvedValue(0),
    updateAgentSessionId: vi.fn(),
    getAgentSessionId: vi.fn().mockResolvedValue(null),
    findLatestAgentSessionIdForFeature: vi.fn().mockResolvedValue(null),
    updateTurnStatus: vi.fn(),
    getTurnStatuses: vi.fn().mockResolvedValue(new Map()),
    getAllActiveTurnStatuses: vi.fn().mockResolvedValue(new Map()),
    accumulateUsage: vi.fn(),
    getUsage: vi.fn().mockResolvedValue(null),
  };

  const processLiveness: IProcessLivenessProbe = {
    isProcessAlive: vi.fn().mockReturnValue(true),
  };

  const cloudEventBus: ICloudDeploymentEventBus = {
    publish: vi.fn(),
    subscribe: vi.fn().mockReturnValue(() => undefined),
  };

  const applicationRepo: IApplicationRepository = {
    create: vi.fn(),
    findById: vi.fn().mockResolvedValue(null),
    findBySlug: vi.fn().mockResolvedValue(null),
    findByPath: vi.fn().mockResolvedValue(null),
    list: vi.fn().mockResolvedValue([]),
    update: vi.fn(),
    softDelete: vi.fn(),
    restore: vi.fn(),
  };

  const logger: ILogger = {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };

  return new StreamAgentEventsUseCase(
    listFeaturesStub,
    agentRunRepo,
    phaseTimingRepo,
    sessionRepo,
    processLiveness,
    cloudEventBus,
    applicationRepo,
    bus,
    logger
  );
}

function makeEntry(overrides: Partial<OperationLogEntry> = {}): OperationLogEntry {
  return {
    id: 'log-1',
    operationKind: OperationLogKind.ApplicationSetup,
    operationId: 'app-1',
    level: OperationLogLevel.Info,
    message: 'hello world',
    createdAt: new Date('2026-04-14T10:00:00Z'),
    updatedAt: new Date('2026-04-14T10:00:00Z'),
    ...overrides,
  } as unknown as OperationLogEntry;
}

interface Envelope {
  kind: string;
  event?: NotificationEvent;
}

describe('StreamAgentEventsUseCase — operation log bus', () => {
  it('re-emits a publish as an OperationLogAppended notification', async () => {
    const bus = new InMemoryOperationLogEventBus();
    const useCase = buildUseCase(bus);
    const controller = new AbortController();

    const entry = makeEntry({ message: 'first entry' });
    const received: Envelope[] = [];

    // Long poll interval — we want all events to come from the bus, not polling.
    const iterator = useCase.execute({
      signal: controller.signal,
      pollIntervalMs: 10_000,
    });

    const consume = (async () => {
      for await (const event of iterator) {
        received.push(event as Envelope);
        if ((event as Envelope).event?.eventType === NotificationEventType.OperationLogAppended) {
          controller.abort();
        }
      }
    })();

    // Let the subscription attach before publishing.
    await new Promise((resolve) => setImmediate(resolve));
    bus.publish({ entry });

    await consume;

    const appended = received.find(
      (e) =>
        e.kind === 'notification' &&
        e.event?.eventType === NotificationEventType.OperationLogAppended
    );
    expect(appended).toBeDefined();
    expect(appended?.event?.operationLogAppend?.entry).toEqual(entry);
    expect(appended?.event?.agentRunId).toBe('app-1');
    expect(appended?.event?.featureId).toBe('app-1');
    expect(appended?.event?.severity).toBe(NotificationSeverity.Info);
  });

  it('maps Warn / Error levels to Warning / Error severity', async () => {
    const bus = new InMemoryOperationLogEventBus();
    const useCase = buildUseCase(bus);
    const controller = new AbortController();

    const received: Envelope[] = [];
    let seenCount = 0;

    const iterator = useCase.execute({
      signal: controller.signal,
      pollIntervalMs: 10_000,
    });

    const consume = (async () => {
      for await (const event of iterator) {
        received.push(event as Envelope);
        if ((event as Envelope).event?.eventType === NotificationEventType.OperationLogAppended) {
          seenCount++;
          if (seenCount >= 2) controller.abort();
        }
      }
    })();

    await new Promise((resolve) => setImmediate(resolve));
    bus.publish({
      entry: makeEntry({ id: 'log-w', level: OperationLogLevel.Warn, message: 'warn' }),
    });
    bus.publish({
      entry: makeEntry({ id: 'log-e', level: OperationLogLevel.Error, message: 'err' }),
    });

    await consume;

    const appendedEvents = received.filter(
      (e) => e.event?.eventType === NotificationEventType.OperationLogAppended
    );
    expect(appendedEvents.length).toBeGreaterThanOrEqual(2);
    expect(appendedEvents[0]?.event?.severity).toBe(NotificationSeverity.Warning);
    expect(appendedEvents[1]?.event?.severity).toBe(NotificationSeverity.Error);
  });

  it('unsubscribes on signal abort so later publishes do not reach a closed generator', async () => {
    const bus = new InMemoryOperationLogEventBus();
    const useCase = buildUseCase(bus);
    const controller = new AbortController();

    const received: Envelope[] = [];
    const iterator = useCase.execute({
      signal: controller.signal,
      pollIntervalMs: 10_000,
    });

    const consume = (async () => {
      for await (const event of iterator) {
        received.push(event as Envelope);
        controller.abort();
      }
    })();

    await new Promise((resolve) => setImmediate(resolve));
    bus.publish({ entry: makeEntry({ id: 'log-1' }) });

    await consume;
    const countAfterAbort = received.length;

    // Publishing after abort must NOT reach the (now-returned) generator.
    bus.publish({ entry: makeEntry({ id: 'log-2' }) });
    await new Promise((resolve) => setImmediate(resolve));

    expect(received.length).toBe(countAfterAbort);
  });
});
