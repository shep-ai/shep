/**
 * MessageDispatcher Unit Tests
 *
 * TDD: RED → GREEN → REFACTOR
 *
 * Covers sendMessage and sendUserMessage routing logic.
 * All deps are mocked — no real processes or DB writes.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

import { MessageDispatcher } from '@/infrastructure/services/interactive/api/message-dispatcher.js';
import { SessionRegistry } from '@/infrastructure/services/interactive/core/session-registry.js';
import type { SessionState } from '@/infrastructure/services/interactive/core/session-registry.js';
import type { SessionPersistence } from '@/infrastructure/services/interactive/core/session-persistence.js';
import type { SessionBootstrapper } from '@/infrastructure/services/interactive/lifecycle/session-bootstrapper.js';
import type { SessionTerminator } from '@/infrastructure/services/interactive/lifecycle/session-terminator.js';
import type { TurnExecutor } from '@/infrastructure/services/interactive/runtime/turn.executor.js';
import type { IInteractiveSessionRepository } from '@/application/ports/output/repositories/interactive-session-repository.interface.js';
import type { IInteractiveMessageRepository } from '@/application/ports/output/repositories/interactive-message-repository.interface.js';
import type { InteractiveSession } from '@/domain/generated/output.js';
import { InteractiveSessionStatus, InteractiveMessageRole } from '@/domain/generated/output.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSessionRepo(
  overrides: Partial<IInteractiveSessionRepository> = {}
): IInteractiveSessionRepository {
  return {
    create: vi.fn().mockResolvedValue(undefined),
    findById: vi.fn().mockResolvedValue(null),
    findByFeatureId: vi.fn().mockResolvedValue(null),
    findAllActive: vi.fn().mockResolvedValue([]),
    updateStatus: vi.fn().mockResolvedValue(undefined),
    updateLastActivity: vi.fn().mockResolvedValue(undefined),
    markAllActiveStopped: vi.fn().mockResolvedValue(undefined),
    countActiveSessions: vi.fn().mockResolvedValue(0),
    updateAgentSessionId: vi.fn().mockResolvedValue(undefined),
    getAgentSessionId: vi.fn().mockResolvedValue(null),
    findLatestAgentSessionIdForFeature: vi.fn().mockResolvedValue(null),
    updateTurnStatus: vi.fn().mockResolvedValue(undefined),
    getTurnStatuses: vi.fn().mockResolvedValue(new Map()),
    getAllActiveTurnStatuses: vi.fn().mockResolvedValue(new Map()),
    accumulateUsage: vi.fn().mockResolvedValue(undefined),
    getUsage: vi.fn().mockResolvedValue(null),
    ...overrides,
  } as unknown as IInteractiveSessionRepository;
}

function makeMessageRepo(): IInteractiveMessageRepository {
  return {
    create: vi.fn().mockResolvedValue(undefined),
    findByFeatureId: vi.fn().mockResolvedValue([]),
    findBySessionId: vi.fn().mockResolvedValue([]),
    deleteByFeatureId: vi.fn().mockResolvedValue(undefined),
  };
}

function makePersistence(): SessionPersistence {
  return {
    persistMessage: vi.fn().mockResolvedValue(undefined),
    updateSessionStatusAndNotify: vi.fn().mockResolvedValue(undefined),
    updateTurnStatusAndNotify: vi.fn().mockResolvedValue(undefined),
  } as unknown as SessionPersistence;
}

function makeBootstrapper(): SessionBootstrapper {
  return {
    startSession: vi.fn().mockResolvedValue({ id: 'session-1', featureId: 'feat-1' }),
  } as unknown as SessionBootstrapper;
}

function makeTerminator(): SessionTerminator {
  return {
    stop: vi.fn().mockResolvedValue(undefined),
    stopByFeature: vi.fn().mockResolvedValue(undefined),
  } as unknown as SessionTerminator;
}

function makeTurnExecutor(): TurnExecutor {
  return {
    enqueueTurn: vi.fn().mockResolvedValue(undefined),
  } as unknown as TurnExecutor;
}

function makeReadyDbSession(sessionId: string, featureId: string): InteractiveSession {
  return {
    id: sessionId,
    featureId,
    status: InteractiveSessionStatus.ready,
    startedAt: new Date(),
    lastActivityAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
  } as InteractiveSession;
}

function makeSessionState(
  sessionId: string,
  featureId: string,
  overrides: Partial<SessionState> = {}
): SessionState {
  return {
    sessionId,
    featureId,
    worktreePath: '/tmp/test',
    model: 'claude-sonnet-4-6',
    agentType: 'claude-code',
    handle: null as any,
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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('MessageDispatcher', () => {
  let registry: SessionRegistry;
  let sessionRepo: IInteractiveSessionRepository;
  let messageRepo: IInteractiveMessageRepository;
  let persistence: SessionPersistence;
  let bootstrapper: SessionBootstrapper;
  let terminator: SessionTerminator;
  let turnExecutor: TurnExecutor;
  let dispatcher: MessageDispatcher;

  beforeEach(() => {
    registry = new SessionRegistry();
    sessionRepo = makeSessionRepo();
    messageRepo = makeMessageRepo();
    persistence = makePersistence();
    bootstrapper = makeBootstrapper();
    terminator = makeTerminator();
    turnExecutor = makeTurnExecutor();

    dispatcher = new MessageDispatcher(
      sessionRepo,
      messageRepo,
      registry,
      persistence,
      bootstrapper,
      terminator,
      turnExecutor
    );
  });

  // ---------------------------------------------------------------------------
  // sendMessage
  // ---------------------------------------------------------------------------

  describe('sendMessage', () => {
    it('throws when session is not in DB', async () => {
      vi.mocked(sessionRepo.findById).mockResolvedValueOnce(null);

      await expect(dispatcher.sendMessage('session-1', 'hello')).rejects.toThrow(
        'Session session-1 is not ready'
      );
    });

    it('throws when DB session status is booting', async () => {
      vi.mocked(sessionRepo.findById).mockResolvedValueOnce({
        id: 'session-1',
        featureId: 'feat-1',
        status: InteractiveSessionStatus.booting,
      } as InteractiveSession);

      await expect(dispatcher.sendMessage('session-1', 'hello')).rejects.toThrow(
        'Session session-1 is not ready'
      );
    });

    it('throws when in-memory state is missing', async () => {
      vi.mocked(sessionRepo.findById).mockResolvedValueOnce(
        makeReadyDbSession('session-1', 'feat-1')
      );
      // registry has no state for session-1

      await expect(dispatcher.sendMessage('session-1', 'hello')).rejects.toThrow(
        'Session session-1 is not ready'
      );
    });

    it('persists message and enqueues turn when ready', async () => {
      const sessionId = 'session-ready-1';
      const featureId = 'feat-send-1';

      registry.set(sessionId, makeSessionState(sessionId, featureId));

      vi.mocked(sessionRepo.findById).mockResolvedValueOnce(
        makeReadyDbSession(sessionId, featureId)
      );

      const result = await dispatcher.sendMessage(sessionId, 'test message');

      expect(result.role).toBe(InteractiveMessageRole.user);
      expect(result.content).toBe('test message');
      expect(result.sessionId).toBe(sessionId);
      expect(result.featureId).toBe(featureId);
      expect(persistence.persistMessage).toHaveBeenCalledOnce();
      expect(sessionRepo.updateLastActivity).toHaveBeenCalledOnce();
      expect(turnExecutor.enqueueTurn).toHaveBeenCalledOnce();
    });
  });

  // ---------------------------------------------------------------------------
  // sendUserMessage
  // ---------------------------------------------------------------------------

  describe('sendUserMessage', () => {
    it('persists user message and boots new session when none exists', async () => {
      // No DB session
      vi.mocked(sessionRepo.findByFeatureId).mockResolvedValue(null);

      const result = await dispatcher.sendUserMessage(
        'feat-new',
        'hello agent',
        '/tmp/worktree',
        'claude-sonnet-4-6'
      );

      expect(result.role).toBe(InteractiveMessageRole.user);
      expect(result.content).toBe('hello agent');
      expect(persistence.persistMessage).toHaveBeenCalledOnce();
      expect(bootstrapper.startSession).toHaveBeenCalledWith(
        'feat-new',
        '/tmp/worktree',
        'claude-sonnet-4-6',
        undefined,
        undefined,
        'hello agent'
      );
    });

    it('skips persistence when persistUserMessage=false', async () => {
      vi.mocked(sessionRepo.findByFeatureId).mockResolvedValue(null);

      await dispatcher.sendUserMessage(
        'feat-no-persist',
        'boot content',
        '/tmp/worktree',
        undefined,
        undefined,
        undefined,
        undefined,
        false
      );

      expect(persistence.persistMessage).not.toHaveBeenCalled();
    });

    it('uses agentKickoffOverride as first turn content if provided', async () => {
      vi.mocked(sessionRepo.findByFeatureId).mockResolvedValue(null);

      await dispatcher.sendUserMessage(
        'feat-override',
        'user content',
        '/tmp/worktree',
        undefined,
        undefined,
        undefined,
        'kickoff override'
      );

      expect(bootstrapper.startSession).toHaveBeenCalledWith(
        'feat-override',
        '/tmp/worktree',
        undefined,
        undefined,
        undefined,
        'kickoff override'
      );
    });

    it('enqueues turn on ready session', async () => {
      const sessionId = 'session-ready-2';
      const featureId = 'feat-ready';

      registry.set(sessionId, makeSessionState(sessionId, featureId));

      vi.mocked(sessionRepo.findById).mockResolvedValue(makeReadyDbSession(sessionId, featureId));

      await dispatcher.sendUserMessage(featureId, 'hello', '/tmp/worktree');

      expect(turnExecutor.enqueueTurn).toHaveBeenCalledOnce();
      expect(bootstrapper.startSession).not.toHaveBeenCalled();
    });

    it('sets pendingUserContent on booting session', async () => {
      const sessionId = 'session-booting-1';
      const featureId = 'feat-booting';

      registry.set(sessionId, makeSessionState(sessionId, featureId));

      vi.mocked(sessionRepo.findById).mockResolvedValue({
        id: sessionId,
        featureId,
        status: InteractiveSessionStatus.booting,
      } as InteractiveSession);

      await dispatcher.sendUserMessage(featureId, 'queued message', '/tmp/worktree');

      const registeredState = registry.get(sessionId);
      expect(registeredState?.pendingUserContent).toBe('queued message');
      expect(turnExecutor.enqueueTurn).not.toHaveBeenCalled();
      expect(bootstrapper.startSession).not.toHaveBeenCalled();
    });

    it('stops model-changed session and boots a new one', async () => {
      const sessionId = 'session-old-model';
      const featureId = 'feat-model-change';

      registry.set(sessionId, makeSessionState(sessionId, featureId, { model: 'old-model' }));

      vi.mocked(sessionRepo.findByFeatureId).mockResolvedValue(null);

      await dispatcher.sendUserMessage(featureId, 'hello', '/tmp/worktree', 'new-model');

      // Old session was stopped
      expect(terminator.stop).toHaveBeenCalledWith(sessionId);
      // Should boot a new session
      expect(bootstrapper.startSession).toHaveBeenCalledWith(
        featureId,
        '/tmp/worktree',
        'new-model',
        undefined,
        undefined,
        'hello'
      );
    });

    it('marks orphaned DB session as stopped before booting', async () => {
      // No in-memory state but DB has an active session
      vi.mocked(sessionRepo.findByFeatureId).mockResolvedValue({
        id: 'orphan-session',
        featureId: 'feat-orphan',
        status: InteractiveSessionStatus.ready,
      } as InteractiveSession);

      await dispatcher.sendUserMessage('feat-orphan', 'hello', '/tmp/worktree');

      expect(persistence.updateSessionStatusAndNotify).toHaveBeenCalledWith(
        'orphan-session',
        'feat-orphan',
        InteractiveSessionStatus.stopped,
        expect.any(Date)
      );
      expect(bootstrapper.startSession).toHaveBeenCalled();
    });
  });
});
