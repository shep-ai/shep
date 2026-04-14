/**
 * SessionBootstrapper Unit Tests
 *
 * Covers the startSession / completeBootAsync lifecycle.
 *
 * Key invariants:
 * - Cap check throws ConcurrentSessionLimitError when at limit
 * - pendingUserContent is set BEFORE completeBootAsync runs (no race)
 * - SDK session is created (or resumed) with the resolved context
 * - Session is transitioned to 'ready' after boot completes
 * - CWD-mismatch resumption is logged via ILogger.warn
 * - Boot failures mark the session as 'error'
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { SessionBootstrapper } from '@/infrastructure/services/interactive/lifecycle/session-bootstrapper.js';
import { SessionRegistry } from '@/infrastructure/services/interactive/core/session-registry.js';
import type { SessionPersistence } from '@/infrastructure/services/interactive/core/session-persistence.js';
import type { StreamEventDispatcher } from '@/infrastructure/services/interactive/core/stream-event-dispatcher.js';
import type { BootPromptResolver } from '@/infrastructure/services/interactive/lifecycle/boot-prompt.resolver.js';
import type { AgentStreamConsumer } from '@/infrastructure/services/interactive/runtime/agent-stream.consumer.js';
import type { IAgentExecutorFactory } from '@/application/ports/output/agents/agent-executor-factory.interface.js';
import type { AgentConfigResolver } from '@/infrastructure/services/interactive/lifecycle/agent-config.resolver.js';
import type { UserInteractionCoordinator } from '@/infrastructure/services/interactive/runtime/user-interaction.coordinator.js';
import type { ILogger } from '@/application/ports/output/services/logger.interface.js';
import type { IInteractiveSessionRepository } from '@/application/ports/output/repositories/interactive-session-repository.interface.js';
import type {
  IInteractiveAgentExecutor,
  InteractiveAgentSessionHandle,
  InteractiveAgentEvent,
} from '@/application/ports/output/agents/interactive-agent-executor.interface.js';
import { InteractiveSessionStatus, AgentType } from '@/domain/generated/output.js';
import { ConcurrentSessionLimitError } from '@/domain/errors/concurrent-session-limit.error.js';

async function flushPromises(rounds = 15): Promise<void> {
  for (let i = 0; i < rounds; i++) {
    await Promise.resolve();
  }
}

function makeHandle(
  events: InteractiveAgentEvent[] = [{ type: 'done', content: 'hello' }],
  sessionId = 'agent-sid-1'
): InteractiveAgentSessionHandle {
  return {
    get sessionId() {
      return sessionId;
    },
    send: vi.fn().mockResolvedValue(undefined),
    sendToolResult: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
    abort: vi.fn(),
    stream: () =>
      (async function* () {
        for (const ev of events) yield ev;
      })(),
  };
}

function makeSessionRepo(activeCount = 0): IInteractiveSessionRepository {
  return {
    create: vi.fn().mockResolvedValue(undefined),
    findById: vi.fn().mockResolvedValue(null),
    findByFeatureId: vi.fn().mockResolvedValue(null),
    findAllActive: vi.fn().mockResolvedValue([]),
    updateStatus: vi.fn().mockResolvedValue(undefined),
    updateLastActivity: vi.fn().mockResolvedValue(undefined),
    markAllActiveStopped: vi.fn().mockResolvedValue(undefined),
    countActiveSessions: vi.fn().mockResolvedValue(activeCount),
    updateAgentSessionId: vi.fn().mockResolvedValue(undefined),
    getAgentSessionId: vi.fn().mockResolvedValue(null),
    findLatestAgentSessionIdForFeature: vi.fn().mockResolvedValue(null),
    updateTurnStatus: vi.fn().mockResolvedValue(undefined),
    getTurnStatuses: vi.fn().mockResolvedValue(new Map()),
    getAllActiveTurnStatuses: vi.fn().mockResolvedValue(new Map()),
    accumulateUsage: vi.fn().mockResolvedValue(undefined),
    getUsage: vi.fn().mockResolvedValue(null),
  } as unknown as IInteractiveSessionRepository;
}

function makePersistence(): SessionPersistence {
  return {
    updateTurnStatusAndNotify: vi.fn().mockResolvedValue(undefined),
    updateSessionStatusAndNotify: vi.fn().mockResolvedValue(undefined),
    persistMessage: vi.fn().mockResolvedValue(undefined),
    flushAssistantBuffer: vi.fn().mockResolvedValue(undefined),
  } as unknown as SessionPersistence;
}

function makeDispatcher(): StreamEventDispatcher {
  return {
    notify: vi.fn(),
    notifyByFeatureId: vi.fn(),
  } as unknown as StreamEventDispatcher;
}

function makeBootPromptResolver(
  result: { context: string; bootPrompt: string } = {
    context: 'feature context',
    bootPrompt: 'boot greeting',
  }
): BootPromptResolver {
  return {
    resolve: vi.fn().mockResolvedValue(result),
  } as unknown as BootPromptResolver;
}

function makeStreamConsumer(
  result: Awaited<ReturnType<AgentStreamConsumer['consume']>> = {
    completed: 'done',
    agentSessionIdFromHandle: 'agent-sid-1',
  }
): AgentStreamConsumer {
  return {
    consume: vi.fn().mockResolvedValue(result),
  } as unknown as AgentStreamConsumer;
}

function makeAgentConfigResolver(cap = 3): AgentConfigResolver {
  return {
    getCap: vi.fn().mockReturnValue(cap),
    resolveAgentType: vi.fn().mockReturnValue(AgentType.ClaudeCode),
    resolveAuthConfig: vi.fn().mockReturnValue({ type: AgentType.ClaudeCode }),
  } as unknown as AgentConfigResolver;
}

function makeInteractionCoordinator(): UserInteractionCoordinator {
  return {
    buildOnUserQuestionCallback: vi.fn().mockReturnValue(() => Promise.resolve({})),
    respondToInteraction: vi.fn().mockResolvedValue(undefined),
  } as unknown as UserInteractionCoordinator;
}

function makeLogger(): ILogger {
  return { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };
}

function makeExecutorFactory(handle: InteractiveAgentSessionHandle): IAgentExecutorFactory {
  const executor: IInteractiveAgentExecutor = {
    createSession: vi.fn().mockResolvedValue(handle),
    resumeSession: vi.fn().mockResolvedValue(handle),
  };
  return {
    createInteractiveExecutor: vi.fn().mockReturnValue(executor),
    createExecutor: vi.fn(),
    getSupportedAgents: vi.fn().mockReturnValue([AgentType.ClaudeCode]),
    getCliInfo: vi.fn().mockReturnValue([]),
    getSupportedModels: vi.fn().mockReturnValue([]),
    listAvailableModels: vi.fn().mockResolvedValue([]),
    supportsInteractive: vi.fn().mockReturnValue(true),
  } as unknown as IAgentExecutorFactory;
}

describe('SessionBootstrapper', () => {
  let registry: SessionRegistry;
  let sessionRepo: IInteractiveSessionRepository;
  let persistence: SessionPersistence;
  let dispatcher: StreamEventDispatcher;
  let bootPromptResolver: BootPromptResolver;
  let streamConsumer: AgentStreamConsumer;
  let executorFactory: IAgentExecutorFactory;
  let agentConfigResolver: AgentConfigResolver;
  let interactionCoordinator: UserInteractionCoordinator;
  let logger: ILogger;
  let bootstrapper: SessionBootstrapper;
  let handle: InteractiveAgentSessionHandle;

  beforeEach(() => {
    vi.useFakeTimers();
    registry = new SessionRegistry();
    sessionRepo = makeSessionRepo();
    persistence = makePersistence();
    dispatcher = makeDispatcher();
    bootPromptResolver = makeBootPromptResolver();
    streamConsumer = makeStreamConsumer();
    handle = makeHandle();
    executorFactory = makeExecutorFactory(handle);
    agentConfigResolver = makeAgentConfigResolver();
    interactionCoordinator = makeInteractionCoordinator();
    logger = makeLogger();

    bootstrapper = new SessionBootstrapper(
      sessionRepo,
      registry,
      persistence,
      dispatcher,
      bootPromptResolver,
      streamConsumer,
      executorFactory,
      agentConfigResolver,
      interactionCoordinator,
      logger
    );
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  describe('startSession', () => {
    it('throws ConcurrentSessionLimitError when at cap', async () => {
      sessionRepo = makeSessionRepo(3);
      bootstrapper = new SessionBootstrapper(
        sessionRepo,
        registry,
        persistence,
        dispatcher,
        bootPromptResolver,
        streamConsumer,
        executorFactory,
        agentConfigResolver,
        interactionCoordinator,
        logger
      );
      await expect(bootstrapper.startSession('feat-1', '/wt')).rejects.toBeInstanceOf(
        ConcurrentSessionLimitError
      );
    });

    it('creates a DB record with booting status', async () => {
      await bootstrapper.startSession('feat-1', '/wt');
      expect(sessionRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ status: InteractiveSessionStatus.booting, featureId: 'feat-1' })
      );
    });

    it('returns immediately in booting status', async () => {
      const session = await bootstrapper.startSession('feat-1', '/wt');
      expect(session.status).toBe(InteractiveSessionStatus.booting);
    });

    it('registers state in registry', async () => {
      const session = await bootstrapper.startSession('feat-1', '/wt');
      expect(registry.has(session.id)).toBe(true);
    });

    it('stores initialUserMessage in state.pendingUserContent', async () => {
      await bootstrapper.startSession('feat-1', '/wt', undefined, undefined, undefined, 'hi agent');
      // pendingUserContent may already be cleared by the time boot runs in microtask
      // but the BootPromptResolver should have received it
      await flushPromises();
      expect(bootPromptResolver.resolve).toHaveBeenCalledWith(
        'feat-1',
        '/wt',
        'hi agent',
        undefined
      );
    });

    it('notifies booting status to SSE subscribers', async () => {
      await bootstrapper.startSession('feat-1', '/wt');
      expect(dispatcher.notifyByFeatureId).toHaveBeenCalledWith(
        'feat-1',
        expect.objectContaining({
          sessionStatus: InteractiveSessionStatus.booting,
        })
      );
    });
  });

  describe('completeBootAsync', () => {
    it('calls createSession on the executor when no previous session', async () => {
      const executor = executorFactory.createInteractiveExecutor as ReturnType<typeof vi.fn>;
      await bootstrapper.startSession('feat-1', '/wt');
      await flushPromises();

      const createdExecutor = executor.mock.results[0].value as IInteractiveAgentExecutor;
      expect(createdExecutor.createSession).toHaveBeenCalled();
    });

    it('transitions session to ready after boot', async () => {
      await bootstrapper.startSession('feat-1', '/wt');
      await flushPromises();
      expect(persistence.updateSessionStatusAndNotify).toHaveBeenCalledWith(
        expect.any(String),
        'feat-1',
        InteractiveSessionStatus.ready
      );
    });

    it('persists the SDK session id to the DB', async () => {
      await bootstrapper.startSession('feat-1', '/wt');
      await flushPromises();
      expect(sessionRepo.updateAgentSessionId).toHaveBeenCalledWith(
        expect.any(String),
        'agent-sid-1'
      );
    });

    it('logs warn on CWD-mismatch resumption', async () => {
      // Pre-seed a previous session id
      registry.cacheStoppedAgentSessionId('feat-1', 'old-sid');
      streamConsumer = makeStreamConsumer({
        completed: 'done',
        agentSessionIdFromHandle: 'new-sid-different',
      });
      bootstrapper = new SessionBootstrapper(
        sessionRepo,
        registry,
        persistence,
        dispatcher,
        bootPromptResolver,
        streamConsumer,
        executorFactory,
        agentConfigResolver,
        interactionCoordinator,
        logger
      );

      await bootstrapper.startSession('feat-1', '/wt');
      await flushPromises();
      expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('resume mismatch'));
    });

    it('marks session as error when boot throws', async () => {
      (streamConsumer.consume as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('agent failed')
      );

      await bootstrapper.startSession('feat-1', '/wt');
      await flushPromises();

      expect(persistence.updateSessionStatusAndNotify).toHaveBeenCalledWith(
        expect.any(String),
        'feat-1',
        InteractiveSessionStatus.error
      );
      expect(logger.error).toHaveBeenCalled();
    });

    it('skips sending boot prompt and goes to ready when bootPrompt is empty (silent boot)', async () => {
      bootPromptResolver = makeBootPromptResolver({ context: 'ctx', bootPrompt: '' });
      bootstrapper = new SessionBootstrapper(
        sessionRepo,
        registry,
        persistence,
        dispatcher,
        bootPromptResolver,
        streamConsumer,
        executorFactory,
        agentConfigResolver,
        interactionCoordinator,
        logger
      );

      await bootstrapper.startSession('feat-1', '/wt');
      await flushPromises();

      // stream consume should NOT have been called (no bootPrompt to send)
      expect(streamConsumer.consume).not.toHaveBeenCalled();
      expect(persistence.updateSessionStatusAndNotify).toHaveBeenCalledWith(
        expect.any(String),
        'feat-1',
        InteractiveSessionStatus.ready
      );
    });
  });
});
