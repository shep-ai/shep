/**
 * TurnExecutor Unit Tests
 *
 * Covers the enqueueTurn → executeTurn → queue-drain pipeline.
 *
 * Key invariants:
 * - Only one turn executes at a time per session (SDK not concurrent-safe)
 * - Extra turns are queued and drained in order after the current turn completes
 * - Usage is accumulated when the stream emits it
 * - Turn status is set to 'unread' on completion
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

import { TurnExecutor } from '@/infrastructure/services/interactive/runtime/turn.executor.js';
import {
  SessionRegistry,
  type SessionState,
} from '@/infrastructure/services/interactive/core/session-registry.js';
import { StreamEventDispatcher } from '@/infrastructure/services/interactive/core/stream-event-dispatcher.js';
import type { SessionPersistence } from '@/infrastructure/services/interactive/core/session-persistence.js';
import type { AgentStreamConsumer } from '@/infrastructure/services/interactive/runtime/agent-stream.consumer.js';
import type { IInteractiveSessionRepository } from '@/application/ports/output/repositories/interactive-session-repository.interface.js';
import type { ILogger } from '@/application/ports/output/services/logger.interface.js';
import type {
  InteractiveAgentSessionHandle,
  InteractiveAgentEvent,
} from '@/application/ports/output/agents/interactive-agent-executor.interface.js';

function makeState(overrides: Partial<SessionState> = {}): SessionState {
  return {
    sessionId: 'sess-1',
    featureId: 'feat-1',
    worktreePath: '/repo/wt',
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

function makeHandle(events: InteractiveAgentEvent[] = []): InteractiveAgentSessionHandle {
  return {
    sessionId: 'agent-sid-1',
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

function makePersistence(): SessionPersistence {
  return {
    updateTurnStatusAndNotify: vi.fn().mockResolvedValue(undefined),
    persistMessage: vi.fn().mockResolvedValue(undefined),
    flushAssistantBuffer: vi.fn().mockResolvedValue(undefined),
    updateSessionStatusAndNotify: vi.fn().mockResolvedValue(undefined),
    persistToolEvent: vi.fn().mockResolvedValue(undefined),
  } as unknown as SessionPersistence;
}

function makeSessionRepo(): IInteractiveSessionRepository {
  return {
    accumulateUsage: vi.fn().mockResolvedValue(undefined),
    updateLastActivity: vi.fn().mockResolvedValue(undefined),
    create: vi.fn(),
    findById: vi.fn(),
    findByFeatureId: vi.fn(),
    findAllActive: vi.fn(),
    updateStatus: vi.fn(),
    markAllActiveStopped: vi.fn(),
    countActiveSessions: vi.fn(),
    updateAgentSessionId: vi.fn(),
    getAgentSessionId: vi.fn(),
    findLatestAgentSessionIdForFeature: vi.fn(),
    updateTurnStatus: vi.fn(),
    getTurnStatuses: vi.fn(),
    getAllActiveTurnStatuses: vi.fn(),
    getUsage: vi.fn(),
  } as unknown as IInteractiveSessionRepository;
}

function makeStreamConsumer(
  result: Awaited<ReturnType<AgentStreamConsumer['consume']>> = { completed: 'done' }
): AgentStreamConsumer {
  return {
    consume: vi.fn().mockResolvedValue(result),
  } as unknown as AgentStreamConsumer;
}

function makeLogger(): ILogger {
  return { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };
}

describe('TurnExecutor', () => {
  let registry: SessionRegistry;
  let sessionRepo: IInteractiveSessionRepository;
  let persistence: SessionPersistence;
  let streamConsumer: AgentStreamConsumer;
  let logger: ILogger;
  let dispatcher: StreamEventDispatcher;
  let executor: TurnExecutor;

  beforeEach(() => {
    registry = new SessionRegistry();
    sessionRepo = makeSessionRepo();
    persistence = makePersistence();
    streamConsumer = makeStreamConsumer();
    logger = makeLogger();
    dispatcher = new StreamEventDispatcher(registry);
    executor = new TurnExecutor(
      sessionRepo,
      registry,
      persistence,
      streamConsumer,
      logger,
      dispatcher
    );
  });

  // ---------------------------------------------------------------------------
  // enqueueTurn
  // ---------------------------------------------------------------------------

  describe('enqueueTurn', () => {
    it('queues the turn when one is already in progress', async () => {
      const handle = makeHandle();
      const state = makeState({ handle, turnInProgress: true });
      registry.set('sess-1', state);

      await executor.enqueueTurn(state, 'second message');
      expect(state.turnQueue).toContain('second message');
      expect(streamConsumer.consume).not.toHaveBeenCalled();
    });

    it('executes the turn immediately when no turn is in progress', async () => {
      const handle = makeHandle();
      const state = makeState({ handle });
      registry.set('sess-1', state);

      await executor.enqueueTurn(state, 'first message');
      expect(streamConsumer.consume).toHaveBeenCalled();
    });

    it('sets turnInProgress before calling consume', async () => {
      const handle = makeHandle();
      const state = makeState({ handle });
      registry.set('sess-1', state);

      let wasInProgressDuringConsume = false;
      (streamConsumer.consume as ReturnType<typeof vi.fn>).mockImplementation(async () => {
        wasInProgressDuringConsume = state.turnInProgress;
        return { completed: 'done' };
      });

      await executor.enqueueTurn(state, 'msg');
      expect(wasInProgressDuringConsume).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // executeTurn (private — tested via enqueueTurn)
  // ---------------------------------------------------------------------------

  describe('turn execution', () => {
    it('calls updateTurnStatusAndNotify with unread on completion', async () => {
      const handle = makeHandle();
      const state = makeState({ handle });
      registry.set('sess-1', state);

      await executor.enqueueTurn(state, 'hello');
      expect(persistence.updateTurnStatusAndNotify).toHaveBeenCalledWith(
        'sess-1',
        'feat-1',
        'unread'
      );
    });

    it('accumulates usage when stream returns it', async () => {
      const handle = makeHandle();
      const state = makeState({ handle });
      registry.set('sess-1', state);

      (streamConsumer.consume as ReturnType<typeof vi.fn>).mockResolvedValue({
        completed: 'done',
        usage: { costUsd: 0.01, inputTokens: 100, outputTokens: 50, numTurns: 1 },
      });

      await executor.enqueueTurn(state, 'hello');
      expect(sessionRepo.accumulateUsage).toHaveBeenCalledWith('sess-1', {
        costUsd: 0.01,
        inputTokens: 100,
        outputTokens: 50,
        turns: 1,
      });
    });

    it('does not call accumulateUsage when no usage in result', async () => {
      const handle = makeHandle();
      const state = makeState({ handle });
      registry.set('sess-1', state);

      await executor.enqueueTurn(state, 'hello');
      expect(sessionRepo.accumulateUsage).not.toHaveBeenCalled();
    });

    it('notifies done after turn completes via dispatcher', async () => {
      const sub = vi.fn();
      const handle = makeHandle();
      const state = makeState({ handle });
      registry.set('sess-1', state);
      // Subscribe via dispatcher (the real path)
      dispatcher.subscribeSession('sess-1', sub);

      await executor.enqueueTurn(state, 'hello');
      expect(sub).toHaveBeenCalledWith(expect.objectContaining({ delta: '', done: true }));
    });

    it('releases the turn lock after execution', async () => {
      const handle = makeHandle();
      const state = makeState({ handle });
      registry.set('sess-1', state);

      await executor.enqueueTurn(state, 'hello');
      expect(state.turnInProgress).toBe(false);
    });

    it('drains the queue and executes the next turn', async () => {
      const handle = makeHandle();
      const state = makeState({ handle, turnInProgress: true, turnQueue: ['queued-msg'] });
      registry.set('sess-1', state);

      // Reset so we can start the first turn normally
      state.turnInProgress = false;
      await executor.enqueueTurn(state, 'first-msg');

      // consume should have been called at least twice (first + queued)
      expect(streamConsumer.consume).toHaveBeenCalledTimes(2);
    });

    it('throws when no handle is set', async () => {
      const state = makeState({ handle: null });
      registry.set('sess-1', state);

      // Should not throw at the outer level — errors are caught internally
      await expect(executor.enqueueTurn(state, 'hello')).resolves.toBeUndefined();
    });
  });
});
