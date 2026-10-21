/**
 * Test doubles shared by the session-boot unit tests
 * (`SessionBootstrapper`, `SessionBootAttempt`, `DeadAgentSessionRecovery`).
 */

import { vi } from 'vitest';

import type { SessionSpaceEnvironment } from '@/infrastructure/services/interactive/lifecycle/session-space-environment.js';
import { SessionBootstrapper } from '@/infrastructure/services/interactive/lifecycle/session-bootstrapper.js';
import { SessionBootAttempt } from '@/infrastructure/services/interactive/lifecycle/session-boot-attempt.js';
import { DeadAgentSessionRecovery } from '@/infrastructure/services/interactive/lifecycle/dead-agent-session.recovery.js';
import {
  SessionRegistry,
  type SessionState,
} from '@/infrastructure/services/interactive/core/session-registry.js';
import type { SessionPersistence } from '@/infrastructure/services/interactive/core/session-persistence.js';
import type { StreamEventDispatcher } from '@/infrastructure/services/interactive/core/stream-event-dispatcher.js';
import type { BootPromptResolver } from '@/infrastructure/services/interactive/lifecycle/boot-prompt.resolver.js';
import type { AgentStreamConsumer } from '@/infrastructure/services/interactive/runtime/agent-stream.consumer.js';
import type { IAgentExecutorFactory } from '@/application/ports/output/agents/agent-executor-factory.interface.js';
import type { AgentConfigResolver } from '@/infrastructure/services/interactive/lifecycle/agent-config.resolver.js';
import type { UserInteractionCoordinator } from '@/infrastructure/services/interactive/runtime/user-interaction.coordinator.js';
import type { ILogger } from '@/application/ports/output/services/logger.interface.js';
import type { AgentQuestionBridgeFactory } from '@/infrastructure/services/agents/agent-question-service/agent-question-bridge.factory.js';
import {
  createMockInteractiveSessionRepository,
  type MockInteractiveSessionRepository,
} from '../../../../../helpers/interactive-session-repository.mock.js';
import type {
  IInteractiveAgentExecutor,
  InteractiveAgentSessionHandle,
  InteractiveAgentEvent,
} from '@/application/ports/output/agents/interactive-agent-executor.interface.js';
import { AgentType } from '@/domain/generated/output.js';

export async function flushPromises(rounds = 15): Promise<void> {
  for (let i = 0; i < rounds; i++) {
    await Promise.resolve();
  }
}

export function makeHandle(
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

export function makeSessionRepo(activeCount = 0): MockInteractiveSessionRepository {
  return createMockInteractiveSessionRepository({
    countActiveSessions: vi.fn().mockResolvedValue(activeCount),
  });
}

export function makePersistence(): SessionPersistence {
  return {
    updateTurnStatusAndNotify: vi.fn().mockResolvedValue(undefined),
    updateSessionStatusAndNotify: vi.fn().mockResolvedValue(undefined),
    failSessionAndNotify: vi.fn().mockResolvedValue(undefined),
    persistMessage: vi.fn().mockResolvedValue(undefined),
    flushAssistantBuffer: vi.fn().mockResolvedValue(undefined),
  } as unknown as SessionPersistence;
}

export function makeDispatcher(): StreamEventDispatcher {
  return {
    notify: vi.fn(),
    notifyByFeatureId: vi.fn(),
  } as unknown as StreamEventDispatcher;
}

export function makeBootPromptResolver(
  result: { context: string; bootPrompt: string } = {
    context: 'feature context',
    bootPrompt: 'boot greeting',
  }
): BootPromptResolver {
  return {
    resolve: vi.fn().mockResolvedValue(result),
  } as unknown as BootPromptResolver;
}

export function makeStreamConsumer(
  result: Awaited<ReturnType<AgentStreamConsumer['consume']>> = {
    completed: 'done',
    agentSessionIdFromHandle: 'agent-sid-1',
  }
): AgentStreamConsumer {
  return {
    consume: vi.fn().mockResolvedValue(result),
  } as unknown as AgentStreamConsumer;
}

export function makeAgentConfigResolver(cap = 3): AgentConfigResolver {
  return {
    getCap: vi.fn().mockReturnValue(cap),
    resolveAgentType: vi.fn().mockReturnValue(AgentType.ClaudeCode),
    resolveAuthConfig: vi.fn().mockReturnValue({ type: AgentType.ClaudeCode }),
  } as unknown as AgentConfigResolver;
}

export function makeInteractionCoordinator(): UserInteractionCoordinator {
  return {
    buildOnUserQuestionCallback: vi.fn().mockReturnValue(() => Promise.resolve({})),
    buildLiveSurface: vi.fn().mockReturnValue({
      ask: () => Promise.resolve({}),
      settleFromElsewhere: () => Promise.resolve(),
    }),
    respondToInteraction: vi.fn().mockResolvedValue(undefined),
  } as unknown as UserInteractionCoordinator;
}

export function makeSpaceEnvironment(
  result: Awaited<ReturnType<SessionSpaceEnvironment['resolve']>> = {}
): SessionSpaceEnvironment {
  return { resolve: vi.fn().mockResolvedValue(result) } as unknown as SessionSpaceEnvironment;
}

export function makeLogger(): ILogger {
  return { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };
}

export function makeExecutorFactory(handle: InteractiveAgentSessionHandle): IAgentExecutorFactory {
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
    warmModelCatalogs: vi.fn().mockResolvedValue(undefined),
    supportsInteractive: vi.fn().mockReturnValue(true),
  } as unknown as IAgentExecutorFactory;
}

/** The interactive executor the factory handed out most recently. */
export function lastCreatedExecutor(factory: IAgentExecutorFactory): IInteractiveAgentExecutor {
  const create = factory.createInteractiveExecutor as ReturnType<typeof vi.fn>;
  return create.mock.results.at(-1)!.value as IInteractiveAgentExecutor;
}

/** Every port the boot collaborators take, as fresh doubles; tests swap entries as needed. */
export interface BootDeps {
  registry: SessionRegistry;
  sessionRepo: MockInteractiveSessionRepository;
  persistence: SessionPersistence;
  dispatcher: StreamEventDispatcher;
  bootPromptResolver: BootPromptResolver;
  streamConsumer: AgentStreamConsumer;
  handle: InteractiveAgentSessionHandle;
  executorFactory: IAgentExecutorFactory;
  agentConfigResolver: AgentConfigResolver;
  interactionCoordinator: UserInteractionCoordinator;
  logger: ILogger;
  spaceEnvironment: SessionSpaceEnvironment;
  questionBridges?: Pick<AgentQuestionBridgeFactory, 'create'>;
}

export function makeBootDeps(): BootDeps {
  const handle = makeHandle();
  return {
    registry: new SessionRegistry(),
    sessionRepo: makeSessionRepo(),
    persistence: makePersistence(),
    dispatcher: makeDispatcher(),
    bootPromptResolver: makeBootPromptResolver(),
    streamConsumer: makeStreamConsumer(),
    handle,
    executorFactory: makeExecutorFactory(handle),
    agentConfigResolver: makeAgentConfigResolver(),
    interactionCoordinator: makeInteractionCoordinator(),
    logger: makeLogger(),
    spaceEnvironment: makeSpaceEnvironment(),
  };
}

export function buildBootAttempt(deps: BootDeps): SessionBootAttempt {
  return new SessionBootAttempt(
    deps.sessionRepo,
    deps.persistence,
    deps.dispatcher,
    deps.bootPromptResolver,
    deps.streamConsumer,
    deps.executorFactory,
    deps.agentConfigResolver,
    deps.interactionCoordinator,
    deps.logger,
    deps.spaceEnvironment,
    deps.questionBridges
  );
}

export function buildDeadSessionRecovery(deps: BootDeps): DeadAgentSessionRecovery {
  return new DeadAgentSessionRecovery(
    deps.sessionRepo,
    deps.registry,
    deps.dispatcher,
    deps.logger
  );
}

/** A bootstrapper wired to real collaborators over the given doubles, as the container builds it. */
export function buildBootstrapper(deps: BootDeps): SessionBootstrapper {
  return new SessionBootstrapper(
    deps.sessionRepo,
    deps.registry,
    deps.persistence,
    deps.dispatcher,
    deps.executorFactory,
    deps.agentConfigResolver,
    deps.logger,
    buildBootAttempt(deps),
    buildDeadSessionRecovery(deps)
  );
}

/** A registered-looking session state, as `startSession` builds it. */
export function makeSessionState(overrides: Partial<SessionState> = {}): SessionState {
  return {
    sessionId: 'session-1',
    featureId: 'feat-1',
    worktreePath: '/wt',
    handle: null,
    currentAssistantBuffer: '',
    toolEventsLog: [],
    subscribers: new Set(),
    turnInProgress: false,
    turnQueue: [],
    pendingInteraction: null,
    pendingInteractionResolver: null,
    ...overrides,
  };
}
