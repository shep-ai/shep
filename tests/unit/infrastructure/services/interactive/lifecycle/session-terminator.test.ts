/**
 * SessionTerminator Unit Tests
 *
 * Covers the two stop paths:
 * - stop(sessionId): stops a session by ID
 * - stopByFeature(featureId): finds the active session and delegates to stop()
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

import { SessionTerminator } from '@/infrastructure/services/interactive/lifecycle/session-terminator.js';
import {
  SessionRegistry,
  type SessionState,
} from '@/infrastructure/services/interactive/core/session-registry.js';
import type { SessionPersistence } from '@/infrastructure/services/interactive/core/session-persistence.js';
import type { StreamEventDispatcher } from '@/infrastructure/services/interactive/core/stream-event-dispatcher.js';
import type { ILogger } from '@/application/ports/output/services/logger.interface.js';
import type { IInteractiveMessageRepository } from '@/application/ports/output/repositories/interactive-message-repository.interface.js';
import type { IWorkflowStepRepository } from '@/application/ports/output/repositories/workflow-step-repository.interface.js';
import { InteractiveSessionStatus } from '@/domain/generated/output.js';

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

function makePersistence(): SessionPersistence {
  return {
    updateSessionStatusAndNotify: vi.fn().mockResolvedValue(undefined),
    updateTurnStatusAndNotify: vi.fn().mockResolvedValue(undefined),
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

function makeLogger(): ILogger {
  return { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };
}

function makeMessageRepo(): IInteractiveMessageRepository {
  return {
    deleteByFeatureId: vi.fn().mockResolvedValue(undefined),
  } as unknown as IInteractiveMessageRepository;
}

function makeWorkflowStepRepo(): IWorkflowStepRepository {
  return {
    deleteByFeatureId: vi.fn().mockResolvedValue(undefined),
  } as unknown as IWorkflowStepRepository;
}

describe('SessionTerminator', () => {
  let registry: SessionRegistry;
  let persistence: SessionPersistence;
  let dispatcher: StreamEventDispatcher;
  let logger: ILogger;
  let messageRepo: IInteractiveMessageRepository;
  let workflowStepRepo: IWorkflowStepRepository;
  let terminator: SessionTerminator;

  beforeEach(() => {
    registry = new SessionRegistry();
    persistence = makePersistence();
    dispatcher = makeDispatcher();
    logger = makeLogger();
    messageRepo = makeMessageRepo();
    workflowStepRepo = makeWorkflowStepRepo();
    terminator = new SessionTerminator(
      registry,
      persistence,
      dispatcher,
      logger,
      messageRepo,
      workflowStepRepo
    );
  });

  // ---------------------------------------------------------------------------
  // stop
  // ---------------------------------------------------------------------------

  describe('stop', () => {
    it('is idempotent when session does not exist', async () => {
      await expect(terminator.stop('nonexistent')).resolves.toBeUndefined();
    });

    it('removes the session from the registry', async () => {
      const state = makeState();
      registry.set('sess-1', state);
      await terminator.stop('sess-1');
      expect(registry.has('sess-1')).toBe(false);
    });

    it('aborts active stream', async () => {
      const abort = new AbortController();
      const abortSpy = vi.spyOn(abort, 'abort');
      const state = makeState({ streamAbort: abort });
      registry.set('sess-1', state);
      await terminator.stop('sess-1');
      expect(abortSpy).toHaveBeenCalled();
    });

    it('clears turnQueue and resets turnInProgress', async () => {
      const state = makeState({ turnInProgress: true, turnQueue: ['msg1', 'msg2'] });
      registry.set('sess-1', state);
      await terminator.stop('sess-1');
      expect(state.turnQueue).toHaveLength(0);
      expect(state.turnInProgress).toBe(false);
    });

    it('caches agentSessionId for resumption', async () => {
      const state = makeState({ agentSessionId: 'agent-sess-abc' });
      registry.set('sess-1', state);
      await terminator.stop('sess-1');
      // After stop, the cached session id should be available for the next boot
      const cached = registry.takeStoppedAgentSessionId('feat-1');
      expect(cached).toBe('agent-sess-abc');
    });

    it('calls close on the handle', async () => {
      const closeMock = vi.fn().mockResolvedValue(undefined);
      const state = makeState({
        handle: {
          close: closeMock,
          send: vi.fn(),
          stream: vi.fn(),
          abort: vi.fn(),
          sessionId: 's',
        } as any,
      });
      registry.set('sess-1', state);
      await terminator.stop('sess-1');
      expect(closeMock).toHaveBeenCalled();
    });

    it('does not throw when handle.close() throws', async () => {
      const state = makeState({
        handle: {
          close: vi.fn().mockRejectedValue(new Error('already closed')),
          send: vi.fn(),
          stream: vi.fn(),
          abort: vi.fn(),
          sessionId: 's',
        } as any,
      });
      registry.set('sess-1', state);
      await expect(terminator.stop('sess-1')).resolves.toBeUndefined();
    });

    it('calls updateSessionStatusAndNotify with stopped', async () => {
      const state = makeState();
      registry.set('sess-1', state);
      await terminator.stop('sess-1');
      expect(persistence.updateSessionStatusAndNotify).toHaveBeenCalledWith(
        'sess-1',
        'feat-1',
        InteractiveSessionStatus.stopped,
        expect.any(Date)
      );
    });

    it('calls updateTurnStatusAndNotify with idle', async () => {
      const state = makeState();
      registry.set('sess-1', state);
      await terminator.stop('sess-1');
      expect(persistence.updateTurnStatusAndNotify).toHaveBeenCalledWith(
        'sess-1',
        'feat-1',
        'idle'
      );
    });

    it('uses logger.debug instead of console.log for diagnostic', async () => {
      const state = makeState();
      registry.set('sess-1', state);
      const consoleSpy = vi.spyOn(console, 'log');
      await terminator.stop('sess-1');
      expect(consoleSpy).not.toHaveBeenCalled();
      expect(logger.debug).toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // stopByFeature
  // ---------------------------------------------------------------------------

  describe('stopByFeature', () => {
    it('is a no-op when no active session for the feature', async () => {
      await expect(terminator.stopByFeature('feat-1')).resolves.toBeUndefined();
    });

    it('stops the active session for the feature', async () => {
      const state = makeState();
      registry.set('sess-1', state);
      await terminator.stopByFeature('feat-1');
      expect(registry.has('sess-1')).toBe(false);
      expect(persistence.updateSessionStatusAndNotify).toHaveBeenCalledWith(
        'sess-1',
        'feat-1',
        InteractiveSessionStatus.stopped,
        expect.any(Date)
      );
    });
  });
});
