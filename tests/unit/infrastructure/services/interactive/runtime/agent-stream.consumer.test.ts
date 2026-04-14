/**
 * AgentStreamConsumer Unit Tests
 *
 * Owns the stream event-loop switch shared between boot and turn modes.
 * This is the most important test file in the interactive-service
 * refactor: it codifies the ordering invariant (every `persistToolEvent`
 * call is AWAITED — never fired with `void`) that prevents duplicate
 * `createdAt` rows from breaking `StepTracker.classifyMessages` on the
 * frontend. See session-persistence.test.ts "persistToolEvent timestamps
 * are strictly increasing under a frozen clock" for the companion
 * regression.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

import { AgentStreamConsumer } from '@/infrastructure/services/interactive/runtime/agent-stream.consumer.js';
import { BootWatchdog } from '@/infrastructure/services/interactive/lifecycle/boot-watchdog.js';
import {
  SessionRegistry,
  type SessionState,
} from '@/infrastructure/services/interactive/core/session-registry.js';
import { StreamEventDispatcher } from '@/infrastructure/services/interactive/core/stream-event-dispatcher.js';
import type { SessionPersistence } from '@/infrastructure/services/interactive/core/session-persistence.js';
import type { ILogger } from '@/application/ports/output/services/logger.interface.js';
import type {
  InteractiveAgentEvent,
  InteractiveAgentSessionHandle,
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

function makeHandle(
  events: InteractiveAgentEvent[],
  sessionId = 'agent-sid-1'
): InteractiveAgentSessionHandle {
  return {
    sessionId,
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

function makeLogger(): ILogger {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };
}

interface PersistenceCall {
  kind: 'persistToolEvent' | 'flushAssistantBuffer' | 'updateSessionStatus' | 'updateTurnStatus';
  args?: unknown[];
}

function makePersistence(): {
  persistence: SessionPersistence;
  calls: PersistenceCall[];
  persistOrder: string[];
  persistConcurrencyPeak: { current: number; peak: number };
} {
  const calls: PersistenceCall[] = [];
  const persistOrder: string[] = [];
  const persistConcurrencyPeak = { current: 0, peak: 0 };

  const persistence = {
    async persistToolEvent(state: SessionState, label: string, detail?: string): Promise<void> {
      persistConcurrencyPeak.current += 1;
      persistConcurrencyPeak.peak = Math.max(
        persistConcurrencyPeak.peak,
        persistConcurrencyPeak.current
      );
      persistOrder.push(`start:${label}`);
      calls.push({ kind: 'persistToolEvent', args: [state, label, detail] });
      // Simulate async I/O so back-to-back calls would overlap if not awaited.
      await new Promise<void>((r) => setTimeout(r, 0));
      persistOrder.push(`end:${label}`);
      persistConcurrencyPeak.current -= 1;
    },
    async flushAssistantBuffer(state: SessionState): Promise<void> {
      calls.push({ kind: 'flushAssistantBuffer', args: [state] });
      state.currentAssistantBuffer = '';
    },
    async updateSessionStatusAndNotify(
      sessionId: string,
      featureId: string,
      status: string
    ): Promise<void> {
      calls.push({ kind: 'updateSessionStatus', args: [sessionId, featureId, status] });
    },
    async updateTurnStatusAndNotify(
      sessionId: string,
      featureId: string,
      turnStatus: string
    ): Promise<void> {
      calls.push({ kind: 'updateTurnStatus', args: [sessionId, featureId, turnStatus] });
    },
    // Methods the consumer never touches, stubbed for completeness.
    persistMessage: vi.fn(),
  } as unknown as SessionPersistence;

  return { persistence, calls, persistOrder, persistConcurrencyPeak };
}

describe('AgentStreamConsumer', () => {
  let registry: SessionRegistry;
  let dispatcher: StreamEventDispatcher;
  let dispatcherNotifySpy: ReturnType<typeof vi.spyOn>;
  let logger: ILogger;

  beforeEach(() => {
    registry = new SessionRegistry();
    dispatcher = new StreamEventDispatcher(registry);
    dispatcherNotifySpy = vi.spyOn(dispatcher, 'notify');
    logger = makeLogger();
  });

  describe('ordering invariant (await persistToolEvent)', () => {
    it('awaits every persistToolEvent so back-to-back tool_use + tool_result never overlap', async () => {
      const { persistence, persistOrder, persistConcurrencyPeak } = makePersistence();
      const consumer = new AgentStreamConsumer(persistence, dispatcher, logger);
      const state = makeState();
      const handle = makeHandle([
        { type: 'tool_use', label: 'Write', detail: 'file.ts' },
        { type: 'tool_result', label: 'Write', detail: 'ok' },
        { type: 'done' },
      ]);

      await consumer.consume(handle, state, 'turn', new AbortController());

      // Peak concurrency MUST be 1 — if `void` was used instead of
      // `await`, two calls would overlap and the peak would be 2.
      expect(persistConcurrencyPeak.peak).toBe(1);
      // Ordering: start/end bracket each call strictly.
      expect(persistOrder).toEqual(['start:Write', 'end:Write', 'start:Write', 'end:Write']);
    });
  });

  describe('boot mode', () => {
    it('returns completed=done on clean boot with a delta + done', async () => {
      const { persistence, calls } = makePersistence();
      const consumer = new AgentStreamConsumer(persistence, dispatcher, logger);
      const state = makeState();
      const handle = makeHandle(
        [{ type: 'delta', content: 'hello' }, { type: 'done' }],
        'agent-boot-sid'
      );
      const watchdog = new BootWatchdog();
      const bumpSpy = vi.spyOn(watchdog, 'bump');

      const result = await consumer.consume(handle, state, 'boot', new AbortController(), watchdog);

      expect(result.completed).toBe('done');
      expect(result.agentSessionIdFromHandle).toBe('agent-boot-sid');
      // watchdog.bump() fired on every event (delta + done = 2 events)
      expect(bumpSpy).toHaveBeenCalledTimes(2);
      // delta accumulated into the buffer
      expect(state.currentAssistantBuffer).toBe('');
      // flushAssistantBuffer was called on done
      expect(calls.some((c) => c.kind === 'flushAssistantBuffer')).toBe(true);
    });

    it('throws on error event during boot', async () => {
      const { persistence } = makePersistence();
      const consumer = new AgentStreamConsumer(persistence, dispatcher, logger);
      const state = makeState();
      const handle = makeHandle([{ type: 'error', content: 'boom' }]);

      await expect(
        consumer.consume(handle, state, 'boot', new AbortController(), new BootWatchdog())
      ).rejects.toThrow(/Agent error during boot/);
    });

    it('does not accumulate usage on done in boot mode', async () => {
      const { persistence, calls } = makePersistence();
      // Consumer must not touch sessionRepo in boot mode (it doesn't even get one).
      const consumer = new AgentStreamConsumer(persistence, dispatcher, logger);
      const state = makeState();
      const handle = makeHandle([
        { type: 'done', usage: { costUsd: 0.1, inputTokens: 100, outputTokens: 50, numTurns: 1 } },
      ]);

      const result = await consumer.consume(
        handle,
        state,
        'boot',
        new AbortController(),
        new BootWatchdog()
      );
      expect(result.completed).toBe('done');
      expect(result.usage).toBeUndefined();
      // Only flushAssistantBuffer; no accumulateUsage call.
      expect(calls.filter((c) => c.kind === 'persistToolEvent')).toHaveLength(0);
    });
  });

  describe('turn mode', () => {
    it('returns usage on done in turn mode', async () => {
      const { persistence } = makePersistence();
      const consumer = new AgentStreamConsumer(persistence, dispatcher, logger);
      const state = makeState();
      const handle = makeHandle([
        { type: 'delta', content: 'partial ' },
        { type: 'tool_use', label: 'Read', detail: 'file.ts' },
        { type: 'tool_result', label: 'Read', detail: 'ok' },
        { type: 'delta', content: 'done.' },
        {
          type: 'done',
          usage: { costUsd: 0.25, inputTokens: 200, outputTokens: 100, numTurns: 2 },
        },
      ]);

      const result = await consumer.consume(handle, state, 'turn', new AbortController());
      expect(result.completed).toBe('done');
      expect(result.usage).toEqual({
        costUsd: 0.25,
        inputTokens: 200,
        outputTokens: 100,
        numTurns: 2,
      });
    });

    it('logs via ILogger.error and continues on error event in turn mode', async () => {
      const { persistence } = makePersistence();
      const consumer = new AgentStreamConsumer(persistence, dispatcher, logger);
      const state = makeState();
      const handle = makeHandle([
        { type: 'error', content: 'transient' },
        { type: 'done', usage: { costUsd: 0, inputTokens: 1, outputTokens: 1, numTurns: 1 } },
      ]);

      const result = await consumer.consume(handle, state, 'turn', new AbortController());
      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('agent error during turn'),
        expect.objectContaining({ sessionId: 'sess-1' })
      );
      expect(result.completed).toBe('done');
      // error event must notify with log: 'Error: ...'
      const errLog = dispatcherNotifySpy.mock.calls.find(
        ([_state, chunk]: [unknown, { log?: string }]) => chunk.log?.startsWith('Error:')
      );
      expect(errLog).toBeDefined();
    });

    it('captures usage from error event even when no subsequent done fires', async () => {
      const { persistence } = makePersistence();
      const consumer = new AgentStreamConsumer(persistence, dispatcher, logger);
      const state = makeState();
      const handle = makeHandle([
        {
          type: 'error',
          content: 'boom',
          usage: { costUsd: 0.1, inputTokens: 5, outputTokens: 5, numTurns: 1 },
        },
      ]);

      const result = await consumer.consume(handle, state, 'turn', new AbortController());
      expect(result.completed).toBe('ended-without-done');
      expect(result.usage).toEqual({
        costUsd: 0.1,
        inputTokens: 5,
        outputTokens: 5,
        numTurns: 1,
      });
    });

    it('ignores init events in turn mode (no "Session started" spam)', async () => {
      const { persistence } = makePersistence();
      const consumer = new AgentStreamConsumer(persistence, dispatcher, logger);
      const state = makeState();
      const handle = makeHandle([{ type: 'init', content: 'Session started' }, { type: 'done' }]);

      await consumer.consume(handle, state, 'turn', new AbortController());
      // init must NOT produce a dispatcher.notify with a log message
      const initLog = dispatcherNotifySpy.mock.calls.find(
        ([_state, chunk]: [unknown, { log?: string }]) => chunk.log === 'Session started'
      );
      expect(initLog).toBeUndefined();
    });

    it('persists task_started and task_done events', async () => {
      const { persistence, calls } = makePersistence();
      const consumer = new AgentStreamConsumer(persistence, dispatcher, logger);
      const state = makeState();
      const handle = makeHandle([
        { type: 'task_started', content: 'subtask A' },
        { type: 'task_done', content: 'subtask A', detail: 'completed' },
        { type: 'done' },
      ]);

      await consumer.consume(handle, state, 'turn', new AbortController());
      const toolCalls = calls.filter((c) => c.kind === 'persistToolEvent');
      // task_started + task_done = 2 persist calls
      expect(toolCalls).toHaveLength(2);
      expect((toolCalls[0].args as unknown[])[1]).toBe('Subtask started');
      expect((toolCalls[1].args as unknown[])[1]).toBe('Subtask completed');
    });

    it('dispatches api_retry and rate_limit events as log messages', async () => {
      const { persistence } = makePersistence();
      const consumer = new AgentStreamConsumer(persistence, dispatcher, logger);
      const state = makeState();
      const handle = makeHandle([
        { type: 'api_retry', content: 'retrying' },
        { type: 'rate_limit', content: 'slow down' },
        { type: 'done' },
      ]);

      await consumer.consume(handle, state, 'turn', new AbortController());
      const logs = dispatcherNotifySpy.mock.calls.map(
        ([_state, chunk]: [unknown, { log?: string }]) => chunk.log
      );
      expect(logs).toContain('retrying');
      expect(logs).toContain('slow down');
    });

    it('notifies status events with the status content as a log', async () => {
      const { persistence } = makePersistence();
      const consumer = new AgentStreamConsumer(persistence, dispatcher, logger);
      const state = makeState();
      const handle = makeHandle([{ type: 'status', content: 'compacting' }, { type: 'done' }]);

      await consumer.consume(handle, state, 'turn', new AbortController());
      const logs = dispatcherNotifySpy.mock.calls.map(
        ([_state, chunk]: [unknown, { log?: string }]) => chunk.log
      );
      expect(logs).toContain('compacting');
    });
  });

  describe('abort + fallbacks', () => {
    it('breaks out of the loop cleanly when the abort signal trips mid-stream', async () => {
      const { persistence } = makePersistence();
      const consumer = new AgentStreamConsumer(persistence, dispatcher, logger);
      const state = makeState();
      const controller = new AbortController();
      // A stream that yields forever until someone aborts.
      const handle: InteractiveAgentSessionHandle = {
        sessionId: 'sid',
        send: vi.fn().mockResolvedValue(undefined),
        sendToolResult: vi.fn().mockResolvedValue(undefined),
        close: vi.fn().mockResolvedValue(undefined),
        abort: vi.fn(),
        stream: () =>
          (async function* () {
            yield { type: 'delta', content: 'a' };
            controller.abort();
            yield { type: 'delta', content: 'b' };
            yield { type: 'done' };
          })(),
      };

      const result = await consumer.consume(handle, state, 'turn', controller);
      // After abort, loop breaks — no done was observed.
      expect(result.completed).toBe('ended-without-done');
    });

    it('returns ended-without-done when the stream ends naturally without a done event', async () => {
      const { persistence } = makePersistence();
      const consumer = new AgentStreamConsumer(persistence, dispatcher, logger);
      const state = makeState();
      const handle = makeHandle([{ type: 'delta', content: 'orphaned' }]);

      const result = await consumer.consume(handle, state, 'turn', new AbortController());
      expect(result.completed).toBe('ended-without-done');
    });
  });
});
