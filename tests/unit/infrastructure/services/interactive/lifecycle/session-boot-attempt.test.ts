/**
 * SessionBootAttempt Unit Tests
 *
 * One boot attempt against an already-registered session state.
 *
 * Key invariants:
 * - SDK session is created (or resumed) with the resolved context
 * - Session is transitioned to 'ready' after boot completes
 * - CWD-mismatch resumption is logged via ILogger.warn
 * - Failures propagate — failure handling belongs to the caller
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import type { SessionBootAttempt } from '@/infrastructure/services/interactive/lifecycle/session-boot-attempt.js';
import type { SessionState } from '@/infrastructure/services/interactive/core/session-registry.js';
import { InteractiveSessionStatus, AgentType } from '@/domain/generated/output.js';
import {
  type BootDeps,
  buildBootAttempt,
  lastCreatedExecutor,
  makeBootDeps,
  makeBootPromptResolver,
  makeSessionState,
  makeStreamConsumer,
} from './session-boot.fixture.js';

describe('SessionBootAttempt', () => {
  let deps: BootDeps;
  let attempt: SessionBootAttempt;
  let state: SessionState;

  beforeEach(() => {
    vi.useFakeTimers();
    deps = makeBootDeps();
    attempt = buildBootAttempt(deps);
    state = makeSessionState();
    deps.registry.set(state.sessionId, state);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('calls createSession on the executor when no previous session', async () => {
    await attempt.run(state, 'feat-1', '/wt');

    expect(lastCreatedExecutor(deps.executorFactory).createSession).toHaveBeenCalled();
  });

  it('resumes the previous agent session when the state has one', async () => {
    state.agentSessionId = 'old-sid';

    await attempt.run(state, 'feat-1', '/wt');

    const executor = lastCreatedExecutor(deps.executorFactory);
    expect(executor.resumeSession).toHaveBeenCalledWith(
      'old-sid',
      expect.objectContaining({ cwd: '/wt', systemPrompt: 'feature context' })
    );
    expect(executor.createSession).not.toHaveBeenCalled();
    expect(deps.bootPromptResolver.resolve).toHaveBeenCalledWith(
      'feat-1',
      '/wt',
      undefined,
      undefined,
      true
    );
  });

  it('hands the pending first turn to the resolver and clears it from state', async () => {
    state.pendingUserContent = 'hi agent';

    await attempt.run(state, 'feat-1', '/wt');

    expect(deps.bootPromptResolver.resolve).toHaveBeenCalledWith(
      'feat-1',
      '/wt',
      'hi agent',
      undefined,
      false
    );
    expect(state.pendingUserContent).toBeUndefined();
  });

  it('passes a question bridge scoped to the session so chat questions reach the inbox (spec 134)', async () => {
    const bridge = { ask: vi.fn() };
    const questionBridges = { create: vi.fn().mockResolvedValue(bridge) };
    deps.questionBridges = questionBridges;
    attempt = buildBootAttempt(deps);

    await attempt.run(state, 'feat-1', '/wt');

    expect(questionBridges.create).toHaveBeenCalledWith(
      { scopeKey: 'feat-1', worktreePath: '/wt', sessionId: state.sessionId },
      expect.objectContaining({
        ask: expect.any(Function),
        settleFromElsewhere: expect.any(Function),
      })
    );
    expect(lastCreatedExecutor(deps.executorFactory).createSession).toHaveBeenCalledWith(
      expect.objectContaining({
        agentQuestionBridge: bridge,
        onUserQuestion: expect.any(Function),
      })
    );
  });

  it("passes the feature's space environment to the agent session", async () => {
    const environment = { set: { GH_CONFIG_DIR: '/gh-acme' }, unset: ['GH_TOKEN'] };
    (deps.spaceEnvironment.resolve as ReturnType<typeof vi.fn>).mockResolvedValue({ environment });

    await attempt.run(state, 'feat-1', '/wt');

    expect(deps.spaceEnvironment.resolve).toHaveBeenCalledWith('feat-1', AgentType.ClaudeCode);
    expect(lastCreatedExecutor(deps.executorFactory).createSession).toHaveBeenCalledWith(
      expect.objectContaining({
        cwd: '/wt',
        environment: {
          set: { GH_CONFIG_DIR: '/gh-acme', SHEP_CHAT_SCOPE: 'feat-1' },
          unset: ['GH_TOKEN'],
        },
      })
    );
  });

  it('tells every session which chat conversation it is in (spec 137)', async () => {
    state = makeSessionState({ featureId: 'repo-r1', worktreePath: '/repo' });

    await attempt.run(state, 'repo-r1', '/repo');

    expect(lastCreatedExecutor(deps.executorFactory).createSession).toHaveBeenCalledWith(
      expect.objectContaining({
        environment: { set: { SHEP_CHAT_SCOPE: 'repo-r1' }, unset: [] },
      })
    );
  });

  it('throws the refusal before creating an executor when the space does not allow the agent', async () => {
    (deps.spaceEnvironment.resolve as ReturnType<typeof vi.fn>).mockResolvedValue({
      refusal: 'The Acme space allows only cursor agents; this run uses claude-code.',
    });

    await expect(attempt.run(state, 'feat-1', '/wt')).rejects.toThrow(
      'The Acme space allows only cursor agents; this run uses claude-code.'
    );
    expect(deps.executorFactory.createInteractiveExecutor).not.toHaveBeenCalled();
  });

  it('transitions session to ready after boot', async () => {
    await attempt.run(state, 'feat-1', '/wt');

    expect(deps.persistence.updateSessionStatusAndNotify).toHaveBeenCalledWith(
      expect.any(String),
      'feat-1',
      InteractiveSessionStatus.ready
    );
    expect(deps.dispatcher.notify).toHaveBeenCalledWith(state, { delta: '', done: true });
  });

  it('persists the SDK session id to the DB', async () => {
    await attempt.run(state, 'feat-1', '/wt');

    expect(deps.sessionRepo.updateAgentSessionId).toHaveBeenCalledWith(
      expect.any(String),
      'agent-sid-1'
    );
    expect(state.agentSessionId).toBe('agent-sid-1');
  });

  it('logs warn on CWD-mismatch resumption', async () => {
    state.agentSessionId = 'old-sid';
    deps.streamConsumer = makeStreamConsumer({
      completed: 'done',
      agentSessionIdFromHandle: 'new-sid-different',
    });
    attempt = buildBootAttempt(deps);

    await attempt.run(state, 'feat-1', '/wt');

    expect(deps.logger.warn).toHaveBeenCalledWith(expect.stringContaining('resume mismatch'));
  });

  it('goes to ready without an end-of-turn when the boot stream ends without done', async () => {
    deps.streamConsumer = makeStreamConsumer({ completed: 'ended-without-done' });
    attempt = buildBootAttempt(deps);

    await attempt.run(state, 'feat-1', '/wt');

    expect(deps.persistence.updateSessionStatusAndNotify).toHaveBeenCalledWith(
      expect.any(String),
      'feat-1',
      InteractiveSessionStatus.ready
    );
    expect(deps.persistence.updateTurnStatusAndNotify).toHaveBeenCalledWith(
      state.sessionId,
      'feat-1',
      'idle'
    );
    expect(deps.sessionRepo.updateAgentSessionId).not.toHaveBeenCalled();
    expect(deps.dispatcher.notify).not.toHaveBeenCalled();
  });

  it('propagates a stream failure instead of handling it', async () => {
    (deps.streamConsumer.consume as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('agent failed')
    );

    await expect(attempt.run(state, 'feat-1', '/wt')).rejects.toThrow('agent failed');
    expect(deps.persistence.failSessionAndNotify).not.toHaveBeenCalled();
    expect(state.streamAbort).toBeUndefined();
  });

  it('skips sending boot prompt and goes to ready when bootPrompt is empty (silent boot)', async () => {
    deps.bootPromptResolver = makeBootPromptResolver({ context: 'ctx', bootPrompt: '' });
    attempt = buildBootAttempt(deps);

    await attempt.run(state, 'feat-1', '/wt');

    // stream consume should NOT have been called (no bootPrompt to send)
    expect(deps.streamConsumer.consume).not.toHaveBeenCalled();
    expect(deps.persistence.updateSessionStatusAndNotify).toHaveBeenCalledWith(
      expect.any(String),
      'feat-1',
      InteractiveSessionStatus.ready
    );
  });
});
