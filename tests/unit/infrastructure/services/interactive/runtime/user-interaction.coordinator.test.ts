/**
 * UserInteractionCoordinator Unit Tests
 *
 * Covers the AskUserQuestion interaction lifecycle — the "amber dot" feature.
 *
 * buildOnUserQuestionCallback: pauses the SDK stream and waits for user input.
 * respondToInteraction:        persists user answers and resumes the agent stream.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { UserInteractionCoordinator } from '@/infrastructure/services/interactive/runtime/user-interaction.coordinator.js';
import type { SessionPersistence } from '@/infrastructure/services/interactive/core/session-persistence.js';
import type { StreamEventDispatcher } from '@/infrastructure/services/interactive/core/stream-event-dispatcher.js';
import {
  SessionRegistry,
  type SessionState,
} from '@/infrastructure/services/interactive/core/session-registry.js';
import type { ILogger } from '@/application/ports/output/services/logger.interface.js';
import type { UserInteractionData } from '@/application/ports/output/agents/interactive-agent-executor.interface.js';

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

function makePersistence(): { persistence: SessionPersistence; flushCalled: number[] } {
  const flushCalled: number[] = [];
  const persistence = {
    flushAssistantBuffer: vi.fn().mockImplementation(async () => {
      flushCalled.push(Date.now());
    }),
    updateTurnStatusAndNotify: vi.fn().mockResolvedValue(undefined),
    persistMessage: vi.fn().mockResolvedValue(undefined),
    persistToolEvent: vi.fn().mockResolvedValue(undefined),
    updateSessionStatusAndNotify: vi.fn().mockResolvedValue(undefined),
  } as unknown as SessionPersistence;
  return { persistence, flushCalled };
}

function makeDispatcher(): StreamEventDispatcher {
  return {
    notify: vi.fn(),
    notifyByFeatureId: vi.fn(),
    subscribeSession: vi.fn(),
    subscribeByFeature: vi.fn(),
    subscribeAll: vi.fn(),
  } as unknown as StreamEventDispatcher;
}

function makeLogger(): ILogger {
  return { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };
}

function makeInteraction(overrides: Partial<UserInteractionData> = {}): UserInteractionData {
  return {
    toolCallId: 'tc-1',
    questions: [{ header: 'Q1', question: 'What is your name?', options: [], multiSelect: false }],
    ...overrides,
  };
}

describe('UserInteractionCoordinator', () => {
  let persistence: SessionPersistence;
  let dispatcher: StreamEventDispatcher;
  let logger: ILogger;
  let registry: SessionRegistry;
  let coordinator: UserInteractionCoordinator;

  beforeEach(() => {
    vi.useFakeTimers();
    ({ persistence } = makePersistence());
    dispatcher = makeDispatcher();
    logger = makeLogger();
    registry = new SessionRegistry();
    coordinator = new UserInteractionCoordinator(persistence, dispatcher, logger, registry);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  // ---------------------------------------------------------------------------
  // buildOnUserQuestionCallback
  // ---------------------------------------------------------------------------

  describe('buildOnUserQuestionCallback', () => {
    it('returns a function', () => {
      const state = makeState();
      const cb = coordinator.buildOnUserQuestionCallback(state);
      expect(typeof cb).toBe('function');
    });

    it('flushes the assistant buffer when it has content', async () => {
      const state = makeState({ currentAssistantBuffer: 'Hello! ' });
      const cb = coordinator.buildOnUserQuestionCallback(state);

      // Don't await — just start the callback; it blocks waiting for resolver
      const promise = cb(makeInteraction());

      // Let async ops before setTimeout run
      await Promise.resolve();
      await Promise.resolve();
      expect(persistence.flushAssistantBuffer).toHaveBeenCalledWith(state);

      // Advance the 100ms delay then let the rest of the callback run
      vi.advanceTimersByTime(100);
      await Promise.resolve();
      await Promise.resolve();

      // Resolve via pendingInteractionResolver to unblock the promise
      state.pendingInteractionResolver?.({ Q1: 'Alice' });
      await promise;
    });

    it('skips flush when buffer is empty/whitespace', async () => {
      const state = makeState({ currentAssistantBuffer: '   ' });
      const cb = coordinator.buildOnUserQuestionCallback(state);

      const promise = cb(makeInteraction());
      await Promise.resolve();
      expect(persistence.flushAssistantBuffer).not.toHaveBeenCalled();

      state.pendingInteractionResolver?.({ Q1: 'Alice' });
      await promise;
    });

    it('stores the interaction in state.pendingInteraction', async () => {
      const state = makeState();
      const interaction = makeInteraction();
      const cb = coordinator.buildOnUserQuestionCallback(state);

      const promise = cb(interaction);
      await Promise.resolve();
      expect(state.pendingInteraction).toBe(interaction);

      state.pendingInteractionResolver?.({ Q1: 'Alice' });
      await promise;
    });

    it('calls updateTurnStatusAndNotify with awaiting_input', async () => {
      const state = makeState();
      const cb = coordinator.buildOnUserQuestionCallback(state);

      const promise = cb(makeInteraction());
      await Promise.resolve();
      expect(persistence.updateTurnStatusAndNotify).toHaveBeenCalledWith(
        'sess-1',
        'feat-1',
        'awaiting_input'
      );

      state.pendingInteractionResolver?.({ Q1: 'Alice' });
      await promise;
    });

    it('returns the answers when resolver is called', async () => {
      const state = makeState();
      const cb = coordinator.buildOnUserQuestionCallback(state);

      const promise = cb(makeInteraction());
      await Promise.resolve();

      state.pendingInteractionResolver?.({ Q1: 'Alice', Q2: 'Blue' });
      const result = await promise;
      expect(result).toEqual({ Q1: 'Alice', Q2: 'Blue' });
    });

    it('notifies subscribers with interaction payload', async () => {
      const state = makeState();
      const sub = vi.fn();
      state.subscribers.add(sub);
      const interaction = makeInteraction();
      const cb = coordinator.buildOnUserQuestionCallback(state);

      const promise = cb(interaction);
      await Promise.resolve();
      expect(sub).toHaveBeenCalledWith(
        expect.objectContaining({ interaction, log: 'Waiting for your response...' })
      );

      state.pendingInteractionResolver?.({});
      await promise;
    });
  });

  // ---------------------------------------------------------------------------
  // respondToInteraction
  // ---------------------------------------------------------------------------

  describe('respondToInteraction', () => {
    it('throws when no pending interaction', async () => {
      const state = makeState({ pendingInteraction: null, pendingInteractionResolver: null });
      await expect(coordinator.respondToInteraction(state, {})).rejects.toThrow();
    });

    it('persists the answers as a structured user message', async () => {
      const interaction = makeInteraction();
      const resolver = vi.fn();
      const state = makeState({
        pendingInteraction: interaction,
        pendingInteractionResolver: resolver,
      });

      await coordinator.respondToInteraction(state, { Q1: 'Alice' });

      expect(persistence.persistMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          content: expect.stringContaining('{{interaction}}'),
          featureId: 'feat-1',
          sessionId: 'sess-1',
        })
      );
    });

    it('calls the pendingInteractionResolver with the answers', async () => {
      const interaction = makeInteraction();
      const resolver = vi.fn();
      const state = makeState({
        pendingInteraction: interaction,
        pendingInteractionResolver: resolver,
      });

      await coordinator.respondToInteraction(state, { Q1: 'Alice' });
      expect(resolver).toHaveBeenCalledWith({ Q1: 'Alice' });
    });

    it('clears pendingInteraction and pendingInteractionResolver', async () => {
      const interaction = makeInteraction();
      const resolver = vi.fn();
      const state = makeState({
        pendingInteraction: interaction,
        pendingInteractionResolver: resolver,
      });

      await coordinator.respondToInteraction(state, {});
      expect(state.pendingInteraction).toBeNull();
      expect(state.pendingInteractionResolver).toBeNull();
    });

    it('calls updateTurnStatusAndNotify with processing', async () => {
      const resolver = vi.fn();
      const state = makeState({
        pendingInteraction: makeInteraction(),
        pendingInteractionResolver: resolver,
      });

      await coordinator.respondToInteraction(state, {});
      expect(persistence.updateTurnStatusAndNotify).toHaveBeenCalledWith(
        'sess-1',
        'feat-1',
        'processing'
      );
    });

    it('notifies subscribers to clear the waiting message', async () => {
      const sub = vi.fn();
      const resolver = vi.fn();
      const state = makeState({
        pendingInteraction: makeInteraction(),
        pendingInteractionResolver: resolver,
      });
      state.subscribers.add(sub);

      await coordinator.respondToInteraction(state, {});
      expect(sub).toHaveBeenCalledWith(expect.objectContaining({ delta: '', done: false }));
    });
  });
});
