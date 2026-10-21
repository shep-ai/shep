/**
 * DeadAgentSessionRecovery Unit Tests
 *
 * The agent CLI deleted or expired the conversation a session tried to
 * resume. Resuming it again can never work, so the id must go everywhere it
 * is kept (session state, stopped cache AND DB) and the boot runs once more on
 * a fresh conversation. Every other failure propagates untouched.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

import {
  type DeadAgentSessionRecovery,
  NEW_CONVERSATION_NOTICE,
} from '@/infrastructure/services/interactive/lifecycle/dead-agent-session.recovery.js';
import type { SessionState } from '@/infrastructure/services/interactive/core/session-registry.js';
import { AgentSessionNotFoundError } from '@/application/ports/output/agents/agent-session-not-found.error.js';
import {
  type BootDeps,
  buildDeadSessionRecovery,
  makeBootDeps,
  makeHandle,
  makeSessionState,
} from './session-boot.fixture.js';

const deadSessionError = () =>
  new AgentSessionNotFoundError(
    'stale-agent-sid',
    'No conversation found with session ID: stale-agent-sid'
  );

describe('DeadAgentSessionRecovery', () => {
  let deps: BootDeps;
  let recovery: DeadAgentSessionRecovery;
  let state: SessionState;

  beforeEach(() => {
    deps = makeBootDeps();
    recovery = buildDeadSessionRecovery(deps);
    state = makeSessionState({
      agentSessionId: 'stale-agent-sid',
      handle: makeHandle(),
      currentAssistantBuffer: 'partial',
      toolEventsLog: ['tool-event'],
      pendingUserContent: 'hello',
    });
    deps.registry.set(state.sessionId, state);
  });

  /** A boot that fails with `first` on its first call and succeeds afterwards. */
  function bootFailingOnceWith(first: unknown) {
    return vi.fn().mockImplementationOnce(async () => {
      // The attempt consumes the first turn before it fails.
      state.pendingUserContent = undefined;
      throw first;
    });
  }

  it('runs the boot once when it succeeds', async () => {
    const boot = vi.fn().mockResolvedValue(undefined);

    await recovery.run(state, boot);

    expect(boot).toHaveBeenCalledTimes(1);
    expect(deps.sessionRepo.clearAgentSessionIdsForFeature).not.toHaveBeenCalled();
  });

  it('boots once more on a fresh conversation when the resumed one is gone', async () => {
    const boot = bootFailingOnceWith(deadSessionError());

    await recovery.run(state, boot);

    expect(boot).toHaveBeenCalledTimes(2);
    expect(state.agentSessionId).toBeUndefined();
    expect(state.handle).toBeNull();
    expect(state.currentAssistantBuffer).toBe('');
    expect(state.toolEventsLog).toEqual([]);
  });

  it('sends the first turn again on the retry', async () => {
    const seen: (string | undefined)[] = [];
    const boot = vi.fn(async () => {
      seen.push(state.pendingUserContent);
      if (seen.length === 1) {
        state.pendingUserContent = undefined;
        throw deadSessionError();
      }
    });

    await recovery.run(state, boot);

    expect(seen).toEqual(['hello', 'hello']);
  });

  it('forgets the dead id in the DB and the stopped-session cache', async () => {
    deps.registry.cacheStoppedAgentSessionId('feat-1', 'stale-agent-sid');

    await recovery.run(state, bootFailingOnceWith(deadSessionError()));

    expect(deps.sessionRepo.clearAgentSessionIdsForFeature).toHaveBeenCalledWith('feat-1');
    expect(deps.registry.takeStoppedAgentSessionId('feat-1')).toBeUndefined();
  });

  it('closes the dead handle and logs why a new conversation started', async () => {
    const deadHandle = state.handle!;

    await recovery.run(state, bootFailingOnceWith(deadSessionError()));

    expect(deadHandle.close).toHaveBeenCalled();
    expect(deps.logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('stale-agent-sid'),
      expect.anything()
    );
    expect(deps.dispatcher.notify).toHaveBeenCalledWith(state, {
      delta: '',
      done: false,
      log: NEW_CONVERSATION_NOTICE,
    });
  });

  it('still boots fresh when closing the dead handle fails', async () => {
    (state.handle!.close as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('gone'));
    const boot = bootFailingOnceWith(deadSessionError());

    await recovery.run(state, boot);

    expect(boot).toHaveBeenCalledTimes(2);
  });

  it('still boots fresh when clearing the DB fails', async () => {
    deps.sessionRepo.clearAgentSessionIdsForFeature.mockRejectedValue(new Error('db locked'));
    const boot = bootFailingOnceWith(deadSessionError());

    await recovery.run(state, boot);

    expect(boot).toHaveBeenCalledTimes(2);
    expect(deps.logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('could not clear agent session ids'),
      expect.objectContaining({ featureId: 'feat-1' })
    );
  });

  it('propagates a failure of the fresh retry', async () => {
    const boot = bootFailingOnceWith(deadSessionError()).mockRejectedValueOnce(
      new Error('Network timeout')
    );

    await expect(recovery.run(state, boot)).rejects.toThrow('Network timeout');
    expect(boot).toHaveBeenCalledTimes(2);
  });

  it('keeps the agent session id when the boot fails for any other reason', async () => {
    const boot = vi.fn().mockRejectedValue(new Error('Network timeout'));

    await expect(recovery.run(state, boot)).rejects.toThrow('Network timeout');

    expect(boot).toHaveBeenCalledTimes(1);
    expect(state.agentSessionId).toBe('stale-agent-sid');
    expect(deps.sessionRepo.clearAgentSessionIdsForFeature).not.toHaveBeenCalled();
  });

  it('does not retry a session that was stopped while it booted', async () => {
    deps.registry.delete(state.sessionId);
    const boot = vi.fn().mockRejectedValue(deadSessionError());

    await expect(recovery.run(state, boot)).rejects.toBeInstanceOf(AgentSessionNotFoundError);

    expect(boot).toHaveBeenCalledTimes(1);
    expect(deps.sessionRepo.clearAgentSessionIdsForFeature).not.toHaveBeenCalled();
  });
});
