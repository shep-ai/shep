/**
 * StreamAgentEventsUseCase — Application delta unit tests.
 *
 * Covers the Application polling path:
 *   1. First poll seeds the applicationCache without emitting events.
 *   2. A watched-field change on the second poll emits exactly one
 *      `ApplicationUpdated` notification with the correct payload.
 *   3. A subsequent poll with no change emits zero additional events.
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
import type { IOperationLogEventBus } from '@/application/ports/output/services/operation-log-event-bus.interface.js';
import type { IProcessLivenessProbe } from '@/application/ports/output/services/process-liveness.interface.js';

import type { Application, NotificationEvent } from '@/domain/generated/output.js';
import { ApplicationStatus, NotificationEventType } from '@/domain/generated/output.js';

const ISO_NOW = '2026-04-14T10:00:00Z';

function makeApp(overrides: Partial<Application> = {}): Application {
  return {
    id: 'app-1',
    name: 'Test App',
    slug: 'test-app',
    description: 'desc',
    repositoryPath: '/tmp/app',
    additionalPaths: [],
    status: ApplicationStatus.Idle,
    setupComplete: false,
    createdAt: ISO_NOW,
    updatedAt: ISO_NOW,
    deletedAt: null,
    ...overrides,
  } as unknown as Application;
}

function buildUseCase(listMock: () => Promise<Application[]>): StreamAgentEventsUseCase {
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
    list: listMock,
    update: vi.fn(),
    softDelete: vi.fn(),
    restore: vi.fn(),
  };

  const operationLogEventBus: IOperationLogEventBus = {
    publish: vi.fn(),
    subscribe: vi.fn().mockReturnValue(() => undefined),
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
    operationLogEventBus,
    logger
  );
}

interface Envelope {
  kind: string;
  event?: NotificationEvent;
}

async function collectAppUpdates(useCase: StreamAgentEventsUseCase): Promise<Envelope[]> {
  const controller = new AbortController();
  const events: Envelope[] = [];

  // Abort after enough time to go through multiple 1ms poll cycles.
  const drainTimer = setTimeout(() => controller.abort(), 150);

  try {
    for await (const event of useCase.execute({
      signal: controller.signal,
      pollIntervalMs: 1,
    })) {
      events.push(event as Envelope);
    }
  } finally {
    clearTimeout(drainTimer);
  }

  return events;
}

describe('StreamAgentEventsUseCase — application deltas', () => {
  it('first poll seeds the cache silently and a later setupComplete flip emits exactly one ApplicationUpdated', async () => {
    const seed = makeApp({ setupComplete: false });
    const transitioned = makeApp({ setupComplete: true });

    // First call returns seed, every subsequent call returns the transitioned row.
    const listMock = vi.fn().mockResolvedValueOnce([seed]).mockResolvedValue([transitioned]);

    const useCase = buildUseCase(listMock);
    const events = await collectAppUpdates(useCase);

    const appEvents = events.filter(
      (e) =>
        e.kind === 'notification' && e.event?.eventType === NotificationEventType.ApplicationUpdated
    );

    expect(appEvents.length).toBe(1);
    expect(appEvents[0]?.event?.applicationUpdate).toEqual({
      applicationId: 'app-1',
      setupComplete: true,
      status: ApplicationStatus.Idle,
      gitRemoteUrl: undefined,
      cloudDeploymentProvider: undefined,
    });
    // list() was called at least 3 times (seed + transition + stable).
    expect(listMock.mock.calls.length).toBeGreaterThanOrEqual(3);
  });

  it('no watched-field change across polls yields zero ApplicationUpdated events', async () => {
    const app = makeApp({ setupComplete: false });
    const listMock = vi.fn().mockResolvedValue([app]);

    const useCase = buildUseCase(listMock);
    const events = await collectAppUpdates(useCase);

    const appEvents = events.filter(
      (e) =>
        e.kind === 'notification' && e.event?.eventType === NotificationEventType.ApplicationUpdated
    );

    expect(appEvents.length).toBe(0);
  });
});
