/**
 * SessionPersistence Unit Tests
 *
 * Owns the monotonic message clock + every DB mutation that must notify
 * subscribers. The monotonic-clock regression test is mandatory — it
 * codifies the fix that prevents same-millisecond tool_use/tool_result
 * rows from colliding on `ORDER BY created_at ASC` and breaking
 * StepTracker.classifyMessages.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import {
  SessionRegistry,
  type SessionState,
} from '@/infrastructure/services/interactive/core/session-registry.js';
import { StreamEventDispatcher } from '@/infrastructure/services/interactive/core/stream-event-dispatcher.js';
import { SessionPersistence } from '@/infrastructure/services/interactive/core/session-persistence.js';
import type { IInteractiveMessageRepository } from '@/application/ports/output/repositories/interactive-message-repository.interface.js';
import type { IInteractiveSessionRepository } from '@/application/ports/output/repositories/interactive-session-repository.interface.js';
import type { InteractiveMessage } from '@/domain/generated/output.js';
import { InteractiveMessageRole, InteractiveSessionStatus } from '@/domain/generated/output.js';

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

function makeMessage(overrides: Partial<InteractiveMessage> = {}): InteractiveMessage {
  const now = new Date();
  return {
    id: 'msg-1',
    featureId: 'feat-1',
    sessionId: 'sess-1',
    role: InteractiveMessageRole.assistant,
    content: 'hello',
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function makeMessageRepoMock(): IInteractiveMessageRepository {
  return {
    create: vi.fn().mockResolvedValue(undefined),
    findByFeatureId: vi.fn().mockResolvedValue([]),
    findBySessionId: vi.fn().mockResolvedValue([]),
    deleteByFeatureId: vi.fn().mockResolvedValue(undefined),
    deleteBySessionId: vi.fn().mockResolvedValue(undefined),
  } as unknown as IInteractiveMessageRepository;
}

function makeSessionRepoMock(): IInteractiveSessionRepository {
  return {
    updateStatus: vi.fn().mockResolvedValue(undefined),
    updateTurnStatus: vi.fn().mockResolvedValue(undefined),
  } as unknown as IInteractiveSessionRepository;
}

describe('SessionPersistence', () => {
  let messageRepo: IInteractiveMessageRepository;
  let sessionRepo: IInteractiveSessionRepository;
  let registry: SessionRegistry;
  let dispatcher: StreamEventDispatcher;
  let persistence: SessionPersistence;

  beforeEach(() => {
    messageRepo = makeMessageRepoMock();
    sessionRepo = makeSessionRepoMock();
    registry = new SessionRegistry();
    dispatcher = new StreamEventDispatcher(registry);
    persistence = new SessionPersistence(messageRepo, sessionRepo, registry, dispatcher);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('persistMessage', () => {
    it('persists the message via the repository and notifies feature subscribers', async () => {
      const featureCb = vi.fn();
      dispatcher.subscribeByFeature('feat-1', featureCb);
      const msg = makeMessage();
      await persistence.persistMessage(msg);
      expect(messageRepo.create).toHaveBeenCalledWith(msg);
      expect(featureCb).toHaveBeenCalledWith(
        expect.objectContaining({ delta: '', done: false, message: msg })
      );
    });

    it('tags the message with the active workflow step when one is set and stepId is empty', async () => {
      registry.setActiveStep('feat-1', 'step-42');
      const msg = makeMessage();
      await persistence.persistMessage(msg);
      const created = (messageRepo.create as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(created.stepId).toBe('step-42');
    });

    it('does NOT override an existing stepId on the message', async () => {
      registry.setActiveStep('feat-1', 'step-42');
      const msg = makeMessage({ stepId: 'explicit-step' });
      await persistence.persistMessage(msg);
      const created = (messageRepo.create as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(created.stepId).toBe('explicit-step');
    });

    it('leaves stepId absent when no active step is registered', async () => {
      const msg = makeMessage();
      await persistence.persistMessage(msg);
      const created = (messageRepo.create as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(created.stepId).toBeUndefined();
    });
  });

  describe('monotonic clock', () => {
    it('assigns strictly-increasing createdAt values even when Date.now() is frozen', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));

      const createdAtValues: number[] = [];
      (messageRepo.create as ReturnType<typeof vi.fn>).mockImplementation(
        async (m: InteractiveMessage) => {
          createdAtValues.push(m.createdAt.getTime());
        }
      );

      const state = makeState();
      // flushAssistantBuffer writes a new assistant message each call with nextMessageDate()
      for (let i = 0; i < 100; i += 1) {
        state.currentAssistantBuffer = `chunk ${i}`;
        await persistence.flushAssistantBuffer(state);
      }

      expect(createdAtValues).toHaveLength(100);
      for (let i = 1; i < createdAtValues.length; i += 1) {
        expect(createdAtValues[i]).toBeGreaterThan(createdAtValues[i - 1]);
      }
    });

    it('persistToolEvent timestamps are strictly increasing under a frozen clock', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));

      const createdAtValues: number[] = [];
      (messageRepo.create as ReturnType<typeof vi.fn>).mockImplementation(
        async (m: InteractiveMessage) => {
          createdAtValues.push(m.createdAt.getTime());
        }
      );

      const state = makeState();
      for (let i = 0; i < 20; i += 1) {
        await persistence.persistToolEvent(state, `tool-${i}`, 'detail');
      }

      expect(createdAtValues).toHaveLength(20);
      for (let i = 1; i < createdAtValues.length; i += 1) {
        expect(createdAtValues[i]).toBeGreaterThan(createdAtValues[i - 1]);
      }
    });
  });

  describe('flushAssistantBuffer', () => {
    it('does nothing when the buffer is empty or whitespace', async () => {
      const state = makeState({ currentAssistantBuffer: '   ' });
      await persistence.flushAssistantBuffer(state);
      expect(messageRepo.create).not.toHaveBeenCalled();
    });

    it('persists the trimmed buffer as a new assistant message and clears it', async () => {
      const state = makeState({ currentAssistantBuffer: '  hi there  ' });
      await persistence.flushAssistantBuffer(state);
      expect(state.currentAssistantBuffer).toBe('');
      const created = (messageRepo.create as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(created.content).toBe('hi there');
      expect(created.role).toBe(InteractiveMessageRole.assistant);
      expect(created.sessionId).toBe('sess-1');
      expect(created.featureId).toBe('feat-1');
    });
  });

  describe('persistToolEvent', () => {
    it('flushes the assistant buffer before writing the tool row', async () => {
      const state = makeState({ currentAssistantBuffer: 'partial prose' });
      await persistence.persistToolEvent(state, 'Thinking', 'planning');

      const createCalls = (messageRepo.create as ReturnType<typeof vi.fn>).mock.calls;
      expect(createCalls.length).toBe(2);
      // First call is the flushed prose
      expect(createCalls[0][0].content).toBe('partial prose');
      // Second call is the tool event itself
      expect(createCalls[1][0].content).toBe('**Thinking** `planning`');
      expect(state.currentAssistantBuffer).toBe('');
    });

    it('omits the detail in markdown when detail is undefined', async () => {
      const state = makeState();
      await persistence.persistToolEvent(state, 'Thinking');
      const created = (messageRepo.create as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(created.content).toBe('**Thinking**');
    });

    it('swallows persistence errors — tool events must not fail the turn', async () => {
      (messageRepo.create as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('db down'));
      const state = makeState();
      await expect(persistence.persistToolEvent(state, 'Thinking')).resolves.toBeUndefined();
    });
  });

  describe('updateSessionStatusAndNotify', () => {
    it('calls updateStatus without endedAt when not supplied', async () => {
      const featureCb = vi.fn();
      dispatcher.subscribeByFeature('feat-1', featureCb);
      await persistence.updateSessionStatusAndNotify(
        'sess-1',
        'feat-1',
        InteractiveSessionStatus.ready
      );
      expect(sessionRepo.updateStatus).toHaveBeenCalledWith(
        'sess-1',
        InteractiveSessionStatus.ready
      );
      expect(featureCb).toHaveBeenCalledWith(
        expect.objectContaining({ sessionStatus: InteractiveSessionStatus.ready })
      );
    });

    it('passes endedAt to updateStatus when supplied', async () => {
      const endedAt = new Date('2026-04-14T10:00:00Z');
      await persistence.updateSessionStatusAndNotify(
        'sess-1',
        'feat-1',
        InteractiveSessionStatus.stopped,
        endedAt
      );
      expect(sessionRepo.updateStatus).toHaveBeenCalledWith(
        'sess-1',
        InteractiveSessionStatus.stopped,
        endedAt
      );
    });
  });

  describe('updateTurnStatusAndNotify', () => {
    it('calls updateTurnStatus and notifies subscribers with the new status', async () => {
      const featureCb = vi.fn();
      dispatcher.subscribeByFeature('feat-1', featureCb);
      await persistence.updateTurnStatusAndNotify('sess-1', 'feat-1', 'processing');
      expect(sessionRepo.updateTurnStatus).toHaveBeenCalledWith('sess-1', 'processing');
      expect(featureCb).toHaveBeenCalledWith(expect.objectContaining({ turnStatus: 'processing' }));
    });
  });
});
