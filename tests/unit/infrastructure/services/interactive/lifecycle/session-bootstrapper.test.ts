/**
 * SessionBootstrapper Unit Tests
 *
 * Covers the startSession / completeBootAsync lifecycle, with the real
 * `SessionBootAttempt` and `DeadAgentSessionRecovery` over test doubles —
 * the same shape the container builds. Each collaborator has its own unit
 * tests (`session-boot-attempt.test.ts`, `dead-agent-session.recovery.test.ts`).
 *
 * Key invariants:
 * - Cap check throws ConcurrentSessionLimitError when at limit
 * - pendingUserContent is set BEFORE completeBootAsync runs (no race)
 * - A previous agent session id is found and the boot resumes it
 * - Boot failures mark the session as 'error'
 * - A dead resumed conversation is forgotten and the boot runs fresh once
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import type { SessionBootstrapper } from '@/infrastructure/services/interactive/lifecycle/session-bootstrapper.js';
import type { SessionRegistry } from '@/infrastructure/services/interactive/core/session-registry.js';
import type { SessionPersistence } from '@/infrastructure/services/interactive/core/session-persistence.js';
import type { StreamEventDispatcher } from '@/infrastructure/services/interactive/core/stream-event-dispatcher.js';
import type { BootPromptResolver } from '@/infrastructure/services/interactive/lifecycle/boot-prompt.resolver.js';
import type { AgentStreamConsumer } from '@/infrastructure/services/interactive/runtime/agent-stream.consumer.js';
import type { IAgentExecutorFactory } from '@/application/ports/output/agents/agent-executor-factory.interface.js';
import type { AgentConfigResolver } from '@/infrastructure/services/interactive/lifecycle/agent-config.resolver.js';
import type { ILogger } from '@/application/ports/output/services/logger.interface.js';
import type { SessionSpaceEnvironment } from '@/infrastructure/services/interactive/lifecycle/session-space-environment.js';
import type { MockInteractiveSessionRepository } from '../../../../../helpers/interactive-session-repository.mock.js';
import type {
  IInteractiveAgentExecutor,
  InteractiveAgentSessionHandle,
} from '@/application/ports/output/agents/interactive-agent-executor.interface.js';
import { InteractiveSessionStatus, AgentType } from '@/domain/generated/output.js';
import { ConcurrentSessionLimitError } from '@/domain/errors/concurrent-session-limit.error.js';
import { InteractiveAgentUnsupportedError } from '@/domain/errors/interactive-agent-unsupported.error.js';
import { AgentSessionNotFoundError } from '@/application/ports/output/agents/agent-session-not-found.error.js';
import {
  type BootDeps,
  buildBootstrapper,
  flushPromises,
  makeBootDeps,
  makeSessionRepo,
} from './session-boot.fixture.js';

describe('SessionBootstrapper', () => {
  let deps: BootDeps;
  let registry: SessionRegistry;
  let sessionRepo: MockInteractiveSessionRepository;
  let persistence: SessionPersistence;
  let dispatcher: StreamEventDispatcher;
  let bootPromptResolver: BootPromptResolver;
  let streamConsumer: AgentStreamConsumer;
  let executorFactory: IAgentExecutorFactory;
  let agentConfigResolver: AgentConfigResolver;
  let logger: ILogger;
  let spaceEnvironment: SessionSpaceEnvironment;
  let bootstrapper: SessionBootstrapper;
  let handle: InteractiveAgentSessionHandle;

  beforeEach(() => {
    vi.useFakeTimers();
    deps = makeBootDeps();
    ({
      registry,
      sessionRepo,
      persistence,
      dispatcher,
      bootPromptResolver,
      streamConsumer,
      handle,
      executorFactory,
      agentConfigResolver,
      logger,
      spaceEnvironment,
    } = deps);
    bootstrapper = buildBootstrapper(deps);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  describe('startSession', () => {
    it('throws ConcurrentSessionLimitError when at cap', async () => {
      deps.sessionRepo = makeSessionRepo(3);
      bootstrapper = buildBootstrapper(deps);
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
        undefined,
        false
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
    it('tells the boot prompt resolver when the agent session is resumed', async () => {
      registry.cacheStoppedAgentSessionId('feat-1', 'old-sid');

      await bootstrapper.startSession('feat-1', '/wt', undefined, undefined, undefined, 'again');
      await flushPromises();

      expect(bootPromptResolver.resolve).toHaveBeenCalledWith(
        'feat-1',
        '/wt',
        'again',
        undefined,
        true
      );
    });

    it('fails the session when the space does not allow the agent', async () => {
      (spaceEnvironment.resolve as ReturnType<typeof vi.fn>).mockResolvedValue({
        refusal: 'The Acme space allows only cursor agents; this run uses claude-code.',
      });

      await bootstrapper.startSession('feat-1', '/wt');
      await flushPromises();

      expect(executorFactory.createInteractiveExecutor).not.toHaveBeenCalled();
      expect(persistence.failSessionAndNotify).toHaveBeenCalledWith(
        expect.any(String),
        'feat-1',
        'The Acme space allows only cursor agents; this run uses claude-code.'
      );
    });

    it('marks session as error when boot throws', async () => {
      (streamConsumer.consume as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('agent failed')
      );

      await bootstrapper.startSession('feat-1', '/wt');
      await flushPromises();

      // The error's message is the reason the user sees — e.g. "cursor-agent
      // is not logged in" — so it travels with the error status.
      expect(persistence.failSessionAndNotify).toHaveBeenCalledWith(
        expect.any(String),
        'feat-1',
        'agent failed'
      );
      expect(logger.error).toHaveBeenCalled();
    });

    // startSession marks the turn 'processing' before the boot runs; a failed
    // boot must hand it back or the chat spinner never stops.
    it('resets the turn to idle when boot throws', async () => {
      (streamConsumer.consume as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('agent failed')
      );

      await bootstrapper.startSession('feat-1', '/wt');
      await flushPromises();

      const calls = (persistence.updateTurnStatusAndNotify as ReturnType<typeof vi.fn>).mock.calls;
      expect(calls.at(-1)).toEqual([expect.any(String), 'feat-1', 'idle']);
    });

    // The agent CLI deleted or expired the conversation the feature last used.
    // Resuming it again can never work, so the id must go everywhere it is
    // kept (stopped cache AND DB) and the chat must come up on a fresh session
    // — otherwise every boot, even after a restart, retries the same dead id.
    describe('when the agent no longer has the resumed conversation', () => {
      const deadSessionError = () =>
        new AgentSessionNotFoundError(
          'stale-agent-sid',
          'No conversation found with session ID: stale-agent-sid'
        );

      function createdExecutor(): IInteractiveAgentExecutor {
        const factory = executorFactory.createInteractiveExecutor as ReturnType<typeof vi.fn>;
        return factory.mock.results.at(-1)!.value as IInteractiveAgentExecutor;
      }

      beforeEach(() => {
        sessionRepo.findLatestAgentSessionIdForFeature.mockResolvedValue('stale-agent-sid');
        (streamConsumer.consume as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
          deadSessionError()
        );
      });

      it('forgets the dead id in the DB and boots a fresh session instead of failing', async () => {
        await bootstrapper.startSession('feat-1', '/wt', undefined, undefined, undefined, 'hello');
        await flushPromises(40);

        expect(createdExecutor().resumeSession).toHaveBeenCalledWith(
          'stale-agent-sid',
          expect.anything()
        );
        expect(sessionRepo.clearAgentSessionIdsForFeature).toHaveBeenCalledWith('feat-1');
        expect(createdExecutor().createSession).toHaveBeenCalledTimes(1);
        expect(persistence.failSessionAndNotify).not.toHaveBeenCalled();
        expect(persistence.updateSessionStatusAndNotify).toHaveBeenCalledWith(
          expect.any(String),
          'feat-1',
          InteractiveSessionStatus.ready
        );
        expect(sessionRepo.updateAgentSessionId).toHaveBeenCalledWith(
          expect.any(String),
          'agent-sid-1'
        );
      });

      it('sends the first turn again, with context, to the fresh session', async () => {
        await bootstrapper.startSession('feat-1', '/wt', undefined, undefined, undefined, 'hello');
        await flushPromises(40);

        const resolveCalls = (bootPromptResolver.resolve as ReturnType<typeof vi.fn>).mock.calls;
        expect(resolveCalls).toEqual([
          ['feat-1', '/wt', 'hello', undefined, true],
          ['feat-1', '/wt', 'hello', undefined, false],
        ]);
      });

      it('closes the dead handle and logs why a new conversation started', async () => {
        await bootstrapper.startSession('feat-1', '/wt');
        await flushPromises(40);

        expect(handle.close).toHaveBeenCalled();
        expect(logger.warn).toHaveBeenCalledWith(
          expect.stringContaining('stale-agent-sid'),
          expect.anything()
        );
      });

      it('evicts the dead id from the stopped-session cache', async () => {
        sessionRepo.findLatestAgentSessionIdForFeature.mockResolvedValue(null);
        registry.cacheStoppedAgentSessionId('feat-1', 'stale-agent-sid');

        await bootstrapper.startSession('feat-1', '/wt');
        await flushPromises(40);

        expect(createdExecutor().resumeSession).toHaveBeenCalledWith(
          'stale-agent-sid',
          expect.anything()
        );
        expect(registry.takeStoppedAgentSessionId('feat-1')).toBeUndefined();
        expect(sessionRepo.clearAgentSessionIdsForFeature).toHaveBeenCalledWith('feat-1');
      });

      it('does not re-cache the dead id when the fresh boot fails too', async () => {
        (streamConsumer.consume as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
          new Error('Network timeout')
        );

        await bootstrapper.startSession('feat-1', '/wt');
        await flushPromises(40);

        expect(persistence.failSessionAndNotify).toHaveBeenCalledWith(
          expect.any(String),
          'feat-1',
          'Network timeout'
        );
        expect(registry.takeStoppedAgentSessionId('feat-1')).toBeUndefined();
      });

      it('still boots fresh when clearing the DB fails', async () => {
        sessionRepo.clearAgentSessionIdsForFeature.mockRejectedValue(new Error('db locked'));

        await bootstrapper.startSession('feat-1', '/wt');
        await flushPromises(40);

        expect(createdExecutor().createSession).toHaveBeenCalledTimes(1);
        expect(persistence.failSessionAndNotify).not.toHaveBeenCalled();
      });
    });

    it('keeps the agent session id for a retry when boot fails for any other reason', async () => {
      sessionRepo.findLatestAgentSessionIdForFeature.mockResolvedValue('valid-agent-sid');
      (streamConsumer.consume as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('Network timeout')
      );

      await bootstrapper.startSession('feat-1', '/wt');
      await flushPromises(40);

      const factory = executorFactory.createInteractiveExecutor as ReturnType<typeof vi.fn>;
      const executor = factory.mock.results[0].value as IInteractiveAgentExecutor;
      expect(executor.createSession).not.toHaveBeenCalled();
      expect(sessionRepo.clearAgentSessionIdsForFeature).not.toHaveBeenCalled();
      expect(persistence.failSessionAndNotify).toHaveBeenCalled();
      expect(registry.takeStoppedAgentSessionId('feat-1')).toBe('valid-agent-sid');
    });

    it('rejects an agent without interactive support before creating a session', async () => {
      (executorFactory.supportsInteractive as ReturnType<typeof vi.fn>).mockReturnValue(false);
      (agentConfigResolver.resolveAgentType as ReturnType<typeof vi.fn>).mockReturnValue(
        AgentType.GeminiCli
      );

      await expect(
        bootstrapper.startSession('feat-1', '/wt', undefined, AgentType.GeminiCli)
      ).rejects.toThrow(InteractiveAgentUnsupportedError);
      expect(sessionRepo.create).not.toHaveBeenCalled();
    });
  });
});
