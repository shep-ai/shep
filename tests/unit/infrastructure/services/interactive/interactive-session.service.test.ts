/**
 * InteractiveSessionService Unit Tests
 *
 * TDD: RED → GREEN → REFACTOR
 *
 * All external dependencies (repos, executor factory, context builder, feature
 * repo, settings) are mocked. No real processes or SDK sessions are created.
 *
 * The service now uses IAgentExecutorFactory to create InteractiveAgentSessionHandle
 * instances. Tests simulate the handle's send() and stream() methods.
 */

import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock execFileSync to avoid slow shep CLI calls from FeatureContextBuilder that
// cause timeouts when running in the full test suite with constrained workers.
vi.mock('node:child_process', () => ({
  execFileSync: vi.fn((cmd: string, args: string[]) => {
    if (cmd === 'shep' && args[0] === '--version') return '0.0.0-test';
    if (cmd === 'shep' && args[0] === '--help')
      return 'Usage: shep [command]\n  feat  Manage features\n  ui    Launch UI';
    if (cmd === 'shep' && args[1] === '--help') return `shep ${args[0]} help text`;
    return '';
  }),
}));

import { InteractiveSessionService } from '@/infrastructure/services/interactive/interactive-session.service.js';
import { ConcurrentSessionLimitError } from '@/domain/errors/concurrent-session-limit.error.js';
import type { IInteractiveSessionRepository } from '@/application/ports/output/repositories/interactive-session-repository.interface.js';
import type { IInteractiveMessageRepository } from '@/application/ports/output/repositories/interactive-message-repository.interface.js';
import type { IAgentExecutorFactory } from '@/application/ports/output/agents/agent-executor-factory.interface.js';
import type {
  IInteractiveAgentExecutor,
  InteractiveAgentSessionHandle,
  InteractiveAgentEvent,
} from '@/application/ports/output/agents/interactive-agent-executor.interface.js';
import type { IFeatureRepository } from '@/application/ports/output/repositories/feature-repository.interface.js';
import { FeatureContextBuilder } from '@/infrastructure/services/interactive/feature-context.builder.js';
import type { Feature, InteractiveSession } from '@/domain/generated/output.js';
import { FeatureMode } from '@/domain/generated/output.js';
import {
  InteractiveSessionStatus,
  InteractiveMessageRole,
  SdlcLifecycle,
  TaskState,
  AgentType,
} from '@/domain/generated/output.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeFeature(overrides?: Partial<Feature>): Feature {
  return {
    id: 'feat-1',
    name: 'Test Feature',
    userQuery: 'do something',
    slug: 'test-feature',
    description: 'test',
    repositoryPath: '/repo',
    branch: 'feat/test',
    lifecycle: SdlcLifecycle.Implementation,
    messages: [],
    plan: {
      id: 'plan-1',
      overview: 'build it',
      requirements: [],
      artifacts: [],
      tasks: [
        {
          id: 't1',
          title: 'Task 1',
          state: TaskState.Todo,
          dependsOn: [],
          actionItems: [],
          baseBranch: 'main',
          branch: 'feat/t1',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ],
      state: 'Ready' as any,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    relatedArtifacts: [],
    mode: FeatureMode.Regular,
    push: false,
    openPr: false,
    forkAndPr: false,
    commitSpecs: false,
    ciWatchEnabled: false,
    approvalGates: { allowPrd: false, allowPlan: false, allowMerge: false },
    worktreePath: '/repo/.worktrees/test',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as Feature;
}

/**
 * Controllable fake session handle for testing.
 * The stream() method yields events pushed into the events array,
 * then yields a 'done' event and returns.
 */
interface FakeHandle {
  handle: InteractiveAgentSessionHandle;
  /** Push events that stream() will yield */
  pushEvent: (event: InteractiveAgentEvent) => void;
  /** Resolve the current stream iteration (causes stream to end) */
  endStream: () => void;
  /** Access the send mock */
  sendMock: ReturnType<typeof vi.fn>;
  /** Access the sendToolResult mock */
  sendToolResultMock: ReturnType<typeof vi.fn>;
  /** Access the close mock */
  closeMock: ReturnType<typeof vi.fn>;
}

function makeFakeHandle(sessionId = 'claude-session-abc'): FakeHandle {
  const sendMock = vi.fn().mockResolvedValue(undefined);
  const closeMock = vi.fn().mockResolvedValue(undefined);

  let resolveWait: (() => void) | null = null;
  let streamEnded = false;
  const pendingEvents: InteractiveAgentEvent[] = [];

  function pushEvent(event: InteractiveAgentEvent): void {
    pendingEvents.push(event);
    if (resolveWait) {
      const r = resolveWait;
      resolveWait = null;
      r();
    }
  }

  function endStream(): void {
    streamEnded = true;
    if (resolveWait) {
      const r = resolveWait;
      resolveWait = null;
      r();
    }
  }

  async function* stream(): AsyncIterable<InteractiveAgentEvent> {
    while (true) {
      while (pendingEvents.length > 0) {
        const event = pendingEvents.shift()!;
        yield event;
        // If this was a 'done' event, stop iterating
        if (event.type === 'done') return;
      }
      if (streamEnded) return;
      // Wait for new events
      await new Promise<void>((resolve) => {
        resolveWait = resolve;
      });
    }
  }

  const sendToolResultMock = vi.fn();

  const handle: InteractiveAgentSessionHandle = {
    get sessionId() {
      return sessionId;
    },
    send: sendMock,
    sendToolResult: sendToolResultMock,
    stream,
    close: closeMock,
    abort: () => closeMock(),
  };

  return { handle, pushEvent, endStream, sendMock, sendToolResultMock, closeMock };
}

/**
 * Flush the microtask queue by repeatedly yielding control.
 * Needed because the service has multiple sequential async operations.
 */
async function flushPromises(rounds = 15): Promise<void> {
  for (let i = 0; i < rounds; i++) {
    await Promise.resolve();
  }
}

// ---------------------------------------------------------------------------
// Test setup
// ---------------------------------------------------------------------------

describe('InteractiveSessionService', () => {
  let sessionRepo: IInteractiveSessionRepository;
  let messageRepo: IInteractiveMessageRepository;
  let executorFactory: IAgentExecutorFactory;
  let featureRepo: IFeatureRepository;
  let contextBuilder: FeatureContextBuilder;
  let service: InteractiveSessionService;

  /** Stack of fake handles the executor will return, one per createSession/resumeSession call. */
  let fakeHandles: FakeHandle[];

  /** Get the most recently created fake handle. */
  function latestHandle(): FakeHandle {
    return fakeHandles[fakeHandles.length - 1];
  }

  beforeEach(() => {
    vi.useFakeTimers();

    fakeHandles = [];

    sessionRepo = {
      create: vi.fn().mockResolvedValue(undefined),
      findById: vi.fn().mockImplementation((id: string) =>
        Promise.resolve({
          id,
          featureId: 'feat-1',
          status: InteractiveSessionStatus.ready,
          startedAt: new Date(),
          lastActivityAt: new Date(),
          createdAt: new Date(),
          updatedAt: new Date(),
        } as InteractiveSession)
      ),
      findByFeatureId: vi.fn().mockResolvedValue(null),
      findAllActive: vi.fn().mockResolvedValue([]),
      updateStatus: vi.fn().mockResolvedValue(undefined),
      updateLastActivity: vi.fn().mockResolvedValue(undefined),
      markAllActiveStopped: vi.fn().mockResolvedValue(undefined),
      countActiveSessions: vi.fn().mockResolvedValue(0),
      updateAgentSessionId: vi.fn().mockResolvedValue(undefined),
      getAgentSessionId: vi.fn().mockResolvedValue(null),
      updateTurnStatus: vi.fn().mockResolvedValue(undefined),
      getTurnStatuses: vi.fn().mockResolvedValue(new Map()),
      getAllActiveTurnStatuses: vi.fn().mockResolvedValue(new Map()),
      accumulateUsage: vi.fn().mockResolvedValue(undefined),
      getUsage: vi.fn().mockResolvedValue(null),
    };

    messageRepo = {
      create: vi.fn().mockResolvedValue(undefined),
      findByFeatureId: vi.fn().mockResolvedValue([]),
      findBySessionId: vi.fn().mockResolvedValue([]),
      deleteByFeatureId: vi.fn().mockResolvedValue(undefined),
    };

    const mockInteractiveExecutor: IInteractiveAgentExecutor = {
      createSession: vi.fn().mockImplementation(() => {
        const fh = makeFakeHandle();
        fakeHandles.push(fh);
        return Promise.resolve(fh.handle);
      }),
      resumeSession: vi.fn().mockImplementation(() => {
        const fh = makeFakeHandle();
        fakeHandles.push(fh);
        return Promise.resolve(fh.handle);
      }),
    };

    executorFactory = {
      createExecutor: vi.fn(),
      getSupportedAgents: vi.fn().mockReturnValue([AgentType.ClaudeCode]),
      getCliInfo: vi.fn().mockReturnValue([]),
      getSupportedModels: vi.fn().mockReturnValue([]),
      createInteractiveExecutor: vi.fn().mockReturnValue(mockInteractiveExecutor),
      supportsInteractive: vi.fn().mockReturnValue(true),
    };

    featureRepo = {
      create: vi.fn(),
      findById: vi.fn().mockResolvedValue(makeFeature()),
      findByIdPrefix: vi.fn(),
      findBySlug: vi.fn(),
      findByBranch: vi.fn(),
      list: vi.fn(),
      update: vi.fn(),
      findByParentId: vi.fn(),
      delete: vi.fn(),
      softDelete: vi.fn(),
    } as unknown as IFeatureRepository;

    contextBuilder = new FeatureContextBuilder();

    service = new InteractiveSessionService(
      sessionRepo,
      messageRepo,
      executorFactory,
      featureRepo,
      contextBuilder
    );
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  /**
   * Start a session and complete the async boot by pushing a done event
   * to the fake handle's stream. startSession returns immediately (booting
   * status); we then simulate the agent's first response to transition to ready.
   */
  async function startAndBoot(): Promise<InteractiveSession> {
    const session = await service.startSession('feat-1', '/wt');
    await flushPromises();

    // The async boot created a session handle — push greeting events
    const fh = latestHandle();
    fh.pushEvent({ type: 'delta', content: 'Hey!' });
    fh.pushEvent({ type: 'done', content: 'Hey!' });
    await flushPromises();

    return session;
  }

  // -------------------------------------------------------------------------
  // startSession
  // -------------------------------------------------------------------------

  describe('startSession', () => {
    it('throws ConcurrentSessionLimitError when at the default cap of 3', async () => {
      (sessionRepo.countActiveSessions as ReturnType<typeof vi.fn>).mockResolvedValue(3);
      await expect(service.startSession('feat-1', '/wt')).rejects.toBeInstanceOf(
        ConcurrentSessionLimitError
      );
    });

    it('throws ConcurrentSessionLimitError with correct counts', async () => {
      (sessionRepo.countActiveSessions as ReturnType<typeof vi.fn>).mockResolvedValue(3);
      const err = await service.startSession('feat-1', '/wt').catch((e: unknown) => e);
      expect(err).toBeInstanceOf(ConcurrentSessionLimitError);
      expect((err as ConcurrentSessionLimitError).activeSessions).toBe(3);
      expect((err as ConcurrentSessionLimitError).cap).toBe(3);
    });

    it('creates a session record in the repository and returns immediately in booting status', async () => {
      const session = await service.startSession('feat-1', '/wt');
      expect(sessionRepo.create).toHaveBeenCalled();
      expect(session).toBeDefined();
      expect(session.status).toBe(InteractiveSessionStatus.booting);
    });

    it('creates an interactive executor via the factory', async () => {
      await service.startSession('feat-1', '/my/worktree');
      await flushPromises();
      expect(executorFactory.createInteractiveExecutor).toHaveBeenCalled();
    });

    it('persists the greeting assistant message after boot completes', async () => {
      const session = await service.startSession('feat-1', '/wt');
      await flushPromises();

      const fh = latestHandle();
      fh.pushEvent({ type: 'delta', content: 'Hey, how can I help?' });
      fh.pushEvent({ type: 'done', content: 'Hey, how can I help?' });
      await flushPromises();

      expect(messageRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          role: InteractiveMessageRole.assistant,
          content: 'Hey, how can I help?',
          featureId: 'feat-1',
          sessionId: session.id,
        })
      );
    });

    it('transitions session to ready after greeting is received', async () => {
      const session = await service.startSession('feat-1', '/wt');
      await flushPromises();

      const fh = latestHandle();
      fh.pushEvent({ type: 'done', content: 'Hey!' });
      await flushPromises();

      expect(sessionRepo.updateStatus).toHaveBeenCalledWith(
        session.id,
        InteractiveSessionStatus.ready
      );
    });
  });

  // -------------------------------------------------------------------------
  // stopSession
  // -------------------------------------------------------------------------

  describe('stopSession', () => {
    it('updates the session status to stopped', async () => {
      const session = await startAndBoot();
      // Clear mock calls from startup
      (sessionRepo.updateStatus as ReturnType<typeof vi.fn>).mockClear();

      await service.stopSession(session.id);

      expect(sessionRepo.updateStatus).toHaveBeenCalledWith(
        session.id,
        InteractiveSessionStatus.stopped,
        expect.any(Date)
      );
    });

    it('is idempotent — calling twice does not throw', async () => {
      const session = await startAndBoot();
      await service.stopSession(session.id);
      await expect(service.stopSession(session.id)).resolves.not.toThrow();
    });

    it('can stop a session that is still booting', async () => {
      const session = await service.startSession('feat-1', '/wt');
      await flushPromises();

      // Stop before the agent sends a done event
      await service.stopSession(session.id);

      expect(sessionRepo.updateStatus).toHaveBeenCalledWith(
        session.id,
        InteractiveSessionStatus.stopped,
        expect.any(Date)
      );
    });

    it('calls close on the handle when stopping', async () => {
      const session = await startAndBoot();
      const fh = latestHandle();

      await service.stopSession(session.id);
      expect(fh.closeMock).toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // sendMessage
  // -------------------------------------------------------------------------

  describe('sendMessage', () => {
    it('sends the message via the handle', async () => {
      const session = await startAndBoot();
      const fh = latestHandle();
      fh.sendMock.mockClear();

      await service.sendMessage(session.id, 'Hello agent');
      await flushPromises();

      expect(fh.sendMock).toHaveBeenCalledWith('Hello agent');
    });

    it('persists the user message to the repository', async () => {
      const session = await startAndBoot();
      messageRepo.create = vi.fn().mockResolvedValue(undefined);

      await service.sendMessage(session.id, 'Test message');

      expect(messageRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          role: InteractiveMessageRole.user,
          content: 'Test message',
          featureId: 'feat-1',
          sessionId: session.id,
        })
      );
    });

    it('persists the assistant response when done event arrives', async () => {
      const session = await startAndBoot();
      messageRepo.create = vi.fn().mockResolvedValue(undefined);

      await service.sendMessage(session.id, 'Test message');
      await flushPromises();

      // Emit the agent's response
      const fh = latestHandle();
      fh.pushEvent({ type: 'delta', content: 'Agent response' });
      fh.pushEvent({ type: 'done', content: 'Agent response' });
      await flushPromises();

      expect(messageRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          role: InteractiveMessageRole.assistant,
          content: 'Agent response',
          featureId: 'feat-1',
          sessionId: session.id,
        })
      );
    });

    it('throws when the session is not in ready status', async () => {
      // findById returns stopped session
      (sessionRepo.findById as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: 'some-session',
        featureId: 'feat-1',
        status: InteractiveSessionStatus.stopped,
        startedAt: new Date(),
        lastActivityAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      await expect(service.sendMessage('some-session', 'Hi')).rejects.toThrow(/not ready/i);
    });
  });

  // -------------------------------------------------------------------------
  // idle timeout
  // -------------------------------------------------------------------------

  describe('idle timeout', () => {
    it('stops the session after the default idle timeout (15 min)', async () => {
      const session = await startAndBoot();
      (sessionRepo.updateStatus as ReturnType<typeof vi.fn>).mockClear();

      // Advance clock past the default 15-minute timeout
      vi.advanceTimersByTime(15 * 60 * 1000 + 1000);
      await flushPromises();

      expect(sessionRepo.updateStatus).toHaveBeenCalledWith(
        session.id,
        InteractiveSessionStatus.stopped,
        expect.any(Date)
      );
    });

    it('does not stop the session before the timeout expires', async () => {
      await startAndBoot();
      (sessionRepo.updateStatus as ReturnType<typeof vi.fn>).mockClear();

      // Advance to just before the timeout
      vi.advanceTimersByTime(14 * 60 * 1000);
      await flushPromises();

      // updateStatus should NOT have been called with 'stopped' yet
      const stoppedCalls = (sessionRepo.updateStatus as ReturnType<typeof vi.fn>).mock.calls.filter(
        (c) => c[1] === InteractiveSessionStatus.stopped
      );
      expect(stoppedCalls.length).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // streaming events
  // -------------------------------------------------------------------------

  describe('streaming events', () => {
    it('notifies subscribers with delta chunks from agent stream', async () => {
      const session = await startAndBoot();

      // Send a message to start a turn
      await service.sendMessage(session.id, 'Tell me something');
      await flushPromises();

      const chunks: string[] = [];
      service.subscribe(session.id, (chunk) => {
        if (!chunk.done && chunk.delta) chunks.push(chunk.delta);
      });

      const fh = latestHandle();
      fh.pushEvent({ type: 'delta', content: 'Hello ' });
      fh.pushEvent({ type: 'delta', content: 'world' });
      await flushPromises();

      expect(chunks).toContain('Hello ');
      expect(chunks).toContain('world');
    });

    it('notifies subscribers with done=true on done event', async () => {
      const session = await startAndBoot();

      await service.sendMessage(session.id, 'Tell me something');
      await flushPromises();

      let doneReceived = false;
      service.subscribe(session.id, (chunk) => {
        if (chunk.done) doneReceived = true;
      });

      const fh = latestHandle();
      fh.pushEvent({ type: 'done', content: 'Final answer.' });
      await flushPromises();

      expect(doneReceived).toBe(true);
    });

    it('unsubscribes when the returned function is called', async () => {
      const session = await startAndBoot();

      await service.sendMessage(session.id, 'Tell me something');
      await flushPromises();

      const chunks: string[] = [];
      const unsub = service.subscribe(session.id, (chunk) => {
        if (!chunk.done && chunk.delta) chunks.push(chunk.delta);
      });

      const fh = latestHandle();
      fh.pushEvent({ type: 'delta', content: 'Before unsub' });
      await flushPromises();
      unsub();
      fh.pushEvent({ type: 'delta', content: 'After unsub' });
      await flushPromises();

      expect(chunks).toContain('Before unsub');
      expect(chunks).not.toContain('After unsub');
    });
  });

  // -------------------------------------------------------------------------
  // getMessages / getSession
  // -------------------------------------------------------------------------

  describe('getMessages', () => {
    it('delegates to messageRepo.findByFeatureId', async () => {
      await service.getMessages('feat-1');
      expect(messageRepo.findByFeatureId).toHaveBeenCalledWith('feat-1', undefined);
    });
  });

  describe('getSession', () => {
    it('delegates to sessionRepo.findById', async () => {
      await service.getSession('session-1');
      expect(sessionRepo.findById).toHaveBeenCalledWith('session-1');
    });
  });

  // -------------------------------------------------------------------------
  // boot error handling
  // -------------------------------------------------------------------------

  describe('boot error handling', () => {
    it('marks session as error when boot stream yields an error event', async () => {
      const session = await service.startSession('feat-1', '/wt');
      await flushPromises();
      (sessionRepo.updateStatus as ReturnType<typeof vi.fn>).mockClear();

      // Push an error event during boot
      const fh = latestHandle();
      fh.pushEvent({ type: 'error', content: 'Something went wrong' });
      await flushPromises();

      expect(sessionRepo.updateStatus).toHaveBeenCalledWith(
        session.id,
        InteractiveSessionStatus.error
      );
    });
  });

  // =========================================================================
  // Feature-scoped API (cold/hot start flows)
  // =========================================================================

  describe('sendUserMessage (feature-scoped)', () => {
    // ── Cold start ────────────────────────────────────────────────────────

    describe('cold start — no active session', () => {
      it('persists the user message to the DB immediately', async () => {
        (messageRepo.create as ReturnType<typeof vi.fn>).mockClear();
        await service.sendUserMessage('feat-1', 'Hey', '/wt');

        expect(messageRepo.create).toHaveBeenCalledWith(
          expect.objectContaining({
            role: InteractiveMessageRole.user,
            content: 'Hey',
            featureId: 'feat-1',
          })
        );
      });

      it('boots a new session when no active session exists', async () => {
        await service.sendUserMessage('feat-1', 'Hey', '/wt');
        await flushPromises();

        expect(sessionRepo.create).toHaveBeenCalled();
        expect(executorFactory.createInteractiveExecutor).toHaveBeenCalled();
      });

      it('persists the assistant response after boot completes', async () => {
        (messageRepo.create as ReturnType<typeof vi.fn>).mockClear();
        await service.sendUserMessage('feat-1', 'Hey', '/wt');
        await flushPromises();

        const fh = latestHandle();
        fh.pushEvent({ type: 'delta', content: 'Hello! I can help with that.' });
        fh.pushEvent({ type: 'done', content: 'Hello! I can help with that.' });
        await flushPromises();

        // Should have persisted: 1) user message, 2) assistant greeting/response
        const createCalls = (messageRepo.create as ReturnType<typeof vi.fn>).mock.calls;
        expect(createCalls.length).toBe(2);
        expect(createCalls[0][0]).toMatchObject({
          role: InteractiveMessageRole.user,
          content: 'Hey',
        });
        expect(createCalls[1][0]).toMatchObject({
          role: InteractiveMessageRole.assistant,
          content: 'Hello! I can help with that.',
        });
      });
    });

    // ── Hot start ─────────────────────────────────────────────────────────

    describe('hot start — session already ready', () => {
      it('does NOT boot a new session', async () => {
        // Boot a session first
        await startAndBoot();
        (sessionRepo.create as ReturnType<typeof vi.fn>).mockClear();

        await service.sendUserMessage('feat-1', 'What is 1+1?', '/wt');
        await flushPromises();

        // No new session created
        expect(sessionRepo.create).not.toHaveBeenCalled();
      });

      it('sends the message directly to the agent handle', async () => {
        await startAndBoot();
        const fh = latestHandle();
        fh.sendMock.mockClear();

        await service.sendUserMessage('feat-1', 'What is 1+1?', '/wt');
        await flushPromises();

        expect(fh.sendMock).toHaveBeenCalledWith('What is 1+1?');
      });

      it('persists both user message and assistant response', async () => {
        await startAndBoot();
        (messageRepo.create as ReturnType<typeof vi.fn>).mockClear();

        await service.sendUserMessage('feat-1', 'What is 1+1?', '/wt');
        await flushPromises();

        const fh = latestHandle();
        fh.pushEvent({ type: 'delta', content: '1+1 = 2' });
        fh.pushEvent({ type: 'done', content: '1+1 = 2' });
        await flushPromises();

        const createCalls = (messageRepo.create as ReturnType<typeof vi.fn>).mock.calls;
        expect(createCalls.length).toBe(2);
        expect(createCalls[0][0]).toMatchObject({
          role: InteractiveMessageRole.user,
          content: 'What is 1+1?',
        });
        expect(createCalls[1][0]).toMatchObject({
          role: InteractiveMessageRole.assistant,
          content: '1+1 = 2',
        });
      });
    });

    // ── Booting session ───────────────────────────────────────────────────

    describe('message during boot', () => {
      it('queues message when session is still booting', async () => {
        // Start a session but don't complete boot
        await service.startSession('feat-1', '/wt');
        await flushPromises();

        // Now send a user message while booting
        (messageRepo.create as ReturnType<typeof vi.fn>).mockClear();
        await service.sendUserMessage('feat-1', 'Hurry up!', '/wt');

        // User message should be persisted immediately
        expect(messageRepo.create).toHaveBeenCalledWith(
          expect.objectContaining({ role: InteractiveMessageRole.user, content: 'Hurry up!' })
        );

        // But no new session should be started (one is already booting)
        expect(sessionRepo.create).toHaveBeenCalledTimes(1);
      });
    });
  });

  // =========================================================================
  // getChatState
  // =========================================================================

  describe('getChatState', () => {
    it('returns messages from the database', async () => {
      const mockMessages = [
        {
          id: 'msg-1',
          featureId: 'feat-1',
          role: InteractiveMessageRole.user,
          content: 'Hey',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: 'msg-2',
          featureId: 'feat-1',
          role: InteractiveMessageRole.assistant,
          content: 'Hello!',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];
      (messageRepo.findByFeatureId as ReturnType<typeof vi.fn>).mockResolvedValue(mockMessages);

      const state = await service.getChatState('feat-1');
      expect(state.messages).toHaveLength(2);
      expect(state.messages[0].content).toBe('Hey');
      expect(state.messages[1].content).toBe('Hello!');
    });

    it('returns null status when no active session', async () => {
      const state = await service.getChatState('feat-1');
      expect(state.sessionStatus).toBeNull();
      expect(state.streamingText).toBeNull();
    });

    it('returns booting status during boot', async () => {
      // Override findById to return booting status
      (sessionRepo.findById as ReturnType<typeof vi.fn>).mockImplementation((id: string) =>
        Promise.resolve({
          id,
          featureId: 'feat-1',
          status: InteractiveSessionStatus.booting,
          startedAt: new Date(),
          lastActivityAt: new Date(),
          createdAt: new Date(),
          updatedAt: new Date(),
        })
      );

      await service.startSession('feat-1', '/wt');
      await flushPromises();

      const state = await service.getChatState('feat-1');
      expect(state.sessionStatus).toBe(InteractiveSessionStatus.booting);
    });

    it('returns streaming text from the current assistant buffer', async () => {
      const session = await startAndBoot();

      // Send a message to start a turn
      await service.sendMessage(session.id, 'Tell me something');
      await flushPromises();

      // Emit partial text — this fills the assistant buffer
      const fh = latestHandle();
      fh.pushEvent({ type: 'delta', content: 'Partial response...' });
      await flushPromises();

      const state = await service.getChatState('feat-1');
      expect(state.streamingText).toBe('Partial response...');
    });

    it('returns null pid since SDK manages processes internally', async () => {
      await startAndBoot();

      const state = await service.getChatState('feat-1');
      expect(state.sessionInfo).toBeDefined();
      expect(state.sessionInfo!.pid).toBeNull();
    });

    it('returns the SDK session ID in sessionInfo', async () => {
      await startAndBoot();

      const state = await service.getChatState('feat-1');
      expect(state.sessionInfo).toBeDefined();
      expect(state.sessionInfo!.sessionId).toBe('claude-session-abc');
    });
  });

  // =========================================================================
  // subscribeByFeature
  // =========================================================================

  describe('subscribeByFeature', () => {
    it('receives deltas from the active session for the feature', async () => {
      const session = await startAndBoot();

      const chunks: string[] = [];
      service.subscribeByFeature('feat-1', (chunk) => {
        if (chunk.delta) chunks.push(chunk.delta);
      });

      // Send a message to start a turn
      await service.sendMessage(session.id, 'Tell me');
      await flushPromises();

      const fh = latestHandle();
      fh.pushEvent({ type: 'delta', content: 'Hello from agent' });
      await flushPromises();

      expect(chunks).toContain('Hello from agent');
    });

    it('returns a no-op unsubscribe when no active session exists', () => {
      const unsub = service.subscribeByFeature('nonexistent-feature', () => undefined);
      expect(unsub).toBeInstanceOf(Function);
      // Should not throw
      unsub();
    });

    it('receives tool use log events', async () => {
      const session = await startAndBoot();

      const logs: string[] = [];
      service.subscribeByFeature('feat-1', (chunk) => {
        if (chunk.log) logs.push(chunk.log);
      });

      await service.sendMessage(session.id, 'Read a file');
      await flushPromises();

      const fh = latestHandle();
      fh.pushEvent({
        type: 'tool_use',
        label: 'Read',
        detail: '/src/app.ts',
      });
      await flushPromises();

      expect(logs.some((l) => l.includes('Read'))).toBe(true);
    });

    it('receives done event when turn completes', async () => {
      const session = await startAndBoot();

      let done = false;
      service.subscribeByFeature('feat-1', (chunk) => {
        if (chunk.done) done = true;
      });

      await service.sendMessage(session.id, 'Quick question');
      await flushPromises();

      latestHandle().pushEvent({ type: 'done', content: 'Quick answer' });
      await flushPromises();

      expect(done).toBe(true);
    });
  });

  // =========================================================================
  // Tool events in persisted messages
  // =========================================================================

  describe('tool events persistence', () => {
    it('persists tool use events as separate messages', async () => {
      const session = await startAndBoot();
      (messageRepo.create as ReturnType<typeof vi.fn>).mockClear();

      await service.sendMessage(session.id, 'Read my file');
      await flushPromises();

      const fh = latestHandle();
      // Simulate tool use followed by done
      fh.pushEvent({ type: 'tool_use', label: 'Read', detail: '/src/app.ts' });
      await flushPromises();

      // Tool event should have been persisted as its own message
      const toolCreate = (messageRepo.create as ReturnType<typeof vi.fn>).mock.calls.find((c) =>
        c[0].content?.includes('**Read**')
      );
      expect(toolCreate).toBeDefined();
      expect(toolCreate![0].content).toContain('/src/app.ts');
    });

    it('persists assistant response separately from tool events', async () => {
      const session = await startAndBoot();
      (messageRepo.create as ReturnType<typeof vi.fn>).mockClear();

      await service.sendMessage(session.id, 'Hello');
      await flushPromises();

      const fh = latestHandle();
      fh.pushEvent({ type: 'done', content: 'Hi there!' });
      await flushPromises();

      const assistantCreate = (messageRepo.create as ReturnType<typeof vi.fn>).mock.calls.find(
        (c) => c[0].role === InteractiveMessageRole.assistant && c[0].content === 'Hi there!'
      );
      expect(assistantCreate).toBeDefined();
    });
  });
});
