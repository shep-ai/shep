/**
 * StreamAgentEventsUseCase Unit Tests
 *
 * Covers the key delta paths extracted from the SSE route:
 *   1. First-seen feature seeds the cache without emitting.
 *   2. Status change (running → completed) yields AgentCompleted.
 *   3. Lifecycle transition to Review yields MergeReviewReady.
 *
 * Uses an abort signal to stop the long-running generator after each scenario.
 */

import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { StreamAgentEventsUseCase } from '@/application/use-cases/agents/stream-agent-events.use-case.js';
import type { ListFeaturesUseCase } from '@/application/use-cases/features/list-features.use-case.js';
import type { IAgentRunRepository } from '@/application/ports/output/agents/agent-run-repository.interface.js';
import type { IPhaseTimingRepository } from '@/application/ports/output/agents/phase-timing-repository.interface.js';
import type { IInteractiveSessionRepository } from '@/application/ports/output/repositories/interactive-session-repository.interface.js';
import type { IApplicationRepository } from '@/application/ports/output/repositories/application-repository.interface.js';
import type { ICloudDeploymentEventBus } from '@/application/ports/output/services/cloud-deployment-event-bus.interface.js';
import type { ILogger } from '@/application/ports/output/services/logger.interface.js';
import type { IOperationLogEventBus } from '@/application/ports/output/services/operation-log-event-bus.interface.js';
import type { IProcessLivenessProbe } from '@/application/ports/output/services/process-liveness.interface.js';
import type { IAgentMessageBus } from '@/application/ports/output/agents/agent-message-bus.interface.js';
import { InMemoryAgentQuestionRepository } from '@/infrastructure/adapters/in-memory/in-memory-agent-question-repository.js';
import { InMemorySupervisorDecisionRepository } from '@/infrastructure/adapters/in-memory/in-memory-supervisor-decision-repository.js';

import type { AgentRun, Feature } from '@/domain/generated/output.js';
import {
  AgentRunStatus,
  AgentType,
  NotificationEventType,
  SdlcLifecycle,
} from '@/domain/generated/output.js';

const ISO_NOW = '2026-04-14T10:00:00Z';

function makeFeature(overrides: Partial<Feature> = {}): Feature {
  return {
    id: 'feat-1',
    name: 'Test feature',
    userQuery: 'do the thing',
    slug: 'test-feature',
    description: 'desc',
    repositoryPath: '/tmp/repo',
    branch: 'feat/test',
    lifecycle: SdlcLifecycle.Implementation,
    messages: [],
    relatedArtifacts: [],
    agentRunId: 'run-1',
    createdAt: ISO_NOW,
    updatedAt: ISO_NOW,
    ...overrides,
  } as Feature;
}

function makeAgentRun(overrides: Partial<AgentRun> = {}): AgentRun {
  return {
    id: 'run-1',
    agentType: AgentType.ClaudeCode,
    agentName: 'feature-agent',
    status: AgentRunStatus.running,
    prompt: 'p',
    threadId: 't-1',
    createdAt: ISO_NOW,
    updatedAt: ISO_NOW,
    ...overrides,
  } as AgentRun;
}

function createUseCase(args: {
  features: Feature[];
  run: AgentRun | null;
  processAlive?: boolean;
}): {
  useCase: StreamAgentEventsUseCase;
  agentRunRepo: IAgentRunRepository;
  phaseTimingRepo: IPhaseTimingRepository;
} {
  const listFeaturesStub = {
    execute: vi.fn().mockResolvedValue(args.features),
  } as unknown as ListFeaturesUseCase;

  const agentRunRepo: IAgentRunRepository = {
    create: vi.fn(),
    findById: vi.fn().mockResolvedValue(args.run),
    findByThreadId: vi.fn(),
    findLatestByFeatureId: vi.fn().mockResolvedValue(null),
    findByIds: vi.fn().mockResolvedValue(args.run ? [args.run] : []),
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
    findByRunIds: vi.fn().mockResolvedValue([]),
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
    isProcessAlive: vi.fn().mockReturnValue(args.processAlive ?? true),
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

  const agentMessageBus: IAgentMessageBus = {
    publish: vi.fn(),
    subscribe: vi.fn().mockReturnValue(() => undefined),
    listFor: vi.fn().mockResolvedValue([]),
  };

  const useCase = new StreamAgentEventsUseCase(
    listFeaturesStub,
    agentRunRepo,
    phaseTimingRepo,
    sessionRepo,
    processLiveness,
    cloudEventBus,
    applicationRepo,
    operationLogEventBus,
    logger,
    agentMessageBus,
    new InMemoryAgentQuestionRepository(),
    new InMemorySupervisorDecisionRepository()
  );

  return { useCase, agentRunRepo, phaseTimingRepo };
}

/**
 * Iterate the generator for exactly `maxTicks` poll cycles then abort. Events
 * emitted across any of those ticks are returned.
 *
 * The use case yields the current batch between waits, so after each yield we
 * update the test state, call `onTick`, and abort once we've collected what
 * we need.
 */
async function collectEvents(useCase: StreamAgentEventsUseCase): Promise<unknown[]> {
  const controller = new AbortController();
  const events: unknown[] = [];
  const iterator = useCase.execute({
    signal: controller.signal,
    pollIntervalMs: 1,
  });

  // Advance poll-by-poll by racing against a small timeout; the generator
  // yields every event in the current batch, then awaits the next interval.
  const drainTimer = setTimeout(() => controller.abort(), 250);

  try {
    for await (const event of iterator) {
      events.push(event);
    }
  } finally {
    clearTimeout(drainTimer);
  }

  return events;
}

describe('StreamAgentEventsUseCase', () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  it('seeds the cache on first tick without emitting notification events', async () => {
    const feature = makeFeature();
    const run = makeAgentRun();
    const { useCase } = createUseCase({ features: [feature], run });

    const events = await collectEvents(useCase);

    const notifications = events.filter((e) => (e as { kind: string }).kind === 'notification');
    expect(notifications).toHaveLength(0);
  });

  it('emits AgentCompleted when status transitions from running to completed', async () => {
    const feature = makeFeature();
    // First call returns running, second call returns completed.
    const runRunning = makeAgentRun({ status: AgentRunStatus.running });
    const runCompleted = makeAgentRun({ status: AgentRunStatus.completed });

    const agentRunRepo: IAgentRunRepository = {
      create: vi.fn(),
      findById: vi.fn().mockResolvedValueOnce(runRunning).mockResolvedValue(runCompleted),
      findByThreadId: vi.fn(),
      findLatestByFeatureId: vi.fn().mockResolvedValue(null),
      findByIds: vi.fn().mockResolvedValueOnce([runRunning]).mockResolvedValue([runCompleted]),
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
      findByRunIds: vi.fn().mockResolvedValue([]),
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
    const listFeaturesStub = {
      execute: vi.fn().mockResolvedValue([feature]),
    } as unknown as ListFeaturesUseCase;

    const agentMessageBus: IAgentMessageBus = {
      publish: vi.fn(),
      subscribe: vi.fn().mockReturnValue(() => undefined),
      listFor: vi.fn().mockResolvedValue([]),
    };

    const useCase = new StreamAgentEventsUseCase(
      listFeaturesStub,
      agentRunRepo,
      phaseTimingRepo,
      sessionRepo,
      processLiveness,
      cloudEventBus,
      applicationRepo,
      operationLogEventBus,
      logger,
      agentMessageBus,
      new InMemoryAgentQuestionRepository(),
      new InMemorySupervisorDecisionRepository()
    );

    const events = await collectEvents(useCase);

    const completedEvents = events.filter((e) => {
      const ev = e as { kind: string; event?: { eventType: NotificationEventType } };
      return (
        ev.kind === 'notification' && ev.event?.eventType === NotificationEventType.AgentCompleted
      );
    });
    expect(completedEvents.length).toBeGreaterThanOrEqual(1);
  });

  it('emits MergeReviewReady when lifecycle transitions to Review', async () => {
    const featureImpl = makeFeature({ lifecycle: SdlcLifecycle.Implementation });
    const featureReview = makeFeature({
      lifecycle: SdlcLifecycle.Review,
      pr: { url: 'https://example.com/pr/42', number: 42 },
    } as Partial<Feature>);

    const listFeaturesStub = {
      execute: vi.fn().mockResolvedValueOnce([featureImpl]).mockResolvedValue([featureReview]),
    } as unknown as ListFeaturesUseCase;

    const run = makeAgentRun({ status: AgentRunStatus.running });
    const agentRunRepo: IAgentRunRepository = {
      create: vi.fn(),
      findById: vi.fn().mockResolvedValue(run),
      findByThreadId: vi.fn(),
      findLatestByFeatureId: vi.fn().mockResolvedValue(null),
      findByIds: vi.fn().mockResolvedValue([run]),
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
      findByRunIds: vi.fn().mockResolvedValue([]),
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

    const agentMessageBus: IAgentMessageBus = {
      publish: vi.fn(),
      subscribe: vi.fn().mockReturnValue(() => undefined),
      listFor: vi.fn().mockResolvedValue([]),
    };

    const useCase = new StreamAgentEventsUseCase(
      listFeaturesStub,
      agentRunRepo,
      phaseTimingRepo,
      sessionRepo,
      processLiveness,
      cloudEventBus,
      applicationRepo,
      operationLogEventBus,
      logger,
      agentMessageBus,
      new InMemoryAgentQuestionRepository(),
      new InMemorySupervisorDecisionRepository()
    );

    const events = await collectEvents(useCase);
    const reviewEvents = events.filter((e) => {
      const ev = e as { kind: string; event?: { eventType: NotificationEventType } };
      return (
        ev.kind === 'notification' && ev.event?.eventType === NotificationEventType.MergeReviewReady
      );
    });
    expect(reviewEvents.length).toBeGreaterThanOrEqual(1);
    const first = reviewEvents[0] as {
      event: { message: string; phaseName: string };
    };
    expect(first.event.phaseName).toBe('merge');
    expect(first.event.message).toContain('https://example.com/pr/42');
  });
});
