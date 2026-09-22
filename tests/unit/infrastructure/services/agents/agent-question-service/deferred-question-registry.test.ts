/**
 * DeferredQuestionRegistry — unit tests (spec 093, task 16).
 *
 * Verifies:
 *  - register/resolve round-trip resolves the Promise with the answer.
 *  - register without a settle rejects with AgentQuestionTimeoutError after the configured duration.
 *  - reject() rejects with AgentQuestionCancelledError carrying the reason.
 *  - cancelAll() matches by scope and leaves unrelated entries alone.
 *  - Timers are cleaned up on resolve/reject/timeout (no leaked entries).
 *  - register on a duplicate id throws synchronously.
 *  - resolve/reject for an unknown id is a no-op.
 */

import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import {
  DeferredQuestionRegistry,
  QUESTION_ANSWER_POLL_INTERVAL_MS,
} from '@/infrastructure/services/agents/agent-question-service/deferred-question-registry.js';
import type { IAgentQuestionRepository } from '@/application/ports/output/repositories/agent-question-repository.interface.js';
import { AgentQuestionStatus, type AgentQuestion } from '@/domain/generated/output.js';
import {
  AgentQuestionCancelledError,
  AgentQuestionTimeoutError,
} from '@/application/ports/output/agents/agent-question-service.interface.js';

describe('DeferredQuestionRegistry', () => {
  let registry: DeferredQuestionRegistry;

  beforeEach(() => {
    vi.useFakeTimers();
    registry = new DeferredQuestionRegistry();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('resolves the Promise with the answer when resolve() is called', async () => {
    const promise = registry.register(
      'q-1',
      { appId: 'app-1', featureId: 'feat-1', agentRunId: 'run-1' },
      60_000
    );

    expect(registry.has('q-1')).toBe(true);

    registry.resolve('q-1', 'option-a');

    await expect(promise).resolves.toBe('option-a');
    expect(registry.has('q-1')).toBe(false);
  });

  it('rejects with AgentQuestionTimeoutError after the configured duration', async () => {
    const promise = registry.register('q-2', { appId: 'app-1' }, 1_000);

    // Capture the rejection BEFORE advancing time so vitest doesn't flag
    // the promise as unhandled.
    const expectation = expect(promise).rejects.toBeInstanceOf(AgentQuestionTimeoutError);

    vi.advanceTimersByTime(1_000);

    await expectation;
    expect(registry.has('q-2')).toBe(false);
  });

  it('rejects with AgentQuestionCancelledError when reject() is called', async () => {
    const promise = registry.register('q-3', { appId: 'app-1' }, 60_000);
    const expectation = expect(promise).rejects.toMatchObject({
      name: 'AgentQuestionCancelledError',
      questionId: 'q-3',
      reason: 'user-stopped',
    });

    registry.reject('q-3', 'user-stopped');

    await expectation;
    expect(registry.has('q-3')).toBe(false);
  });

  it('cancelAll rejects matching scope and leaves others alone', async () => {
    const matching = registry.register('q-a', { appId: 'app-1', agentRunId: 'run-1' }, 60_000);
    const otherRun = registry.register('q-b', { appId: 'app-1', agentRunId: 'run-2' }, 60_000);
    const otherApp = registry.register('q-c', { appId: 'app-2', agentRunId: 'run-1' }, 60_000);

    const matchingExpectation = expect(matching).rejects.toBeInstanceOf(
      AgentQuestionCancelledError
    );

    const cancelled = registry.cancelAll(
      { appId: 'app-1', agentRunId: 'run-1' },
      'worker-shutdown'
    );

    expect(cancelled).toBe(1);
    await matchingExpectation;
    expect(registry.has('q-a')).toBe(false);
    expect(registry.has('q-b')).toBe(true);
    expect(registry.has('q-c')).toBe(true);

    // Tidy up so the test doesn't leak unhandled rejections.
    registry.reject('q-b');
    registry.reject('q-c');
    await Promise.allSettled([otherRun, otherApp]);
  });

  it('cancelAll with only appId matches every awaiter for that app', async () => {
    const a = registry.register('q-1', { appId: 'app-1', featureId: 'feat-a' }, 60_000);
    const b = registry.register('q-2', { appId: 'app-1', featureId: 'feat-b' }, 60_000);
    const aExp = expect(a).rejects.toBeInstanceOf(AgentQuestionCancelledError);
    const bExp = expect(b).rejects.toBeInstanceOf(AgentQuestionCancelledError);

    expect(registry.cancelAll({ appId: 'app-1' })).toBe(2);

    await aExp;
    await bExp;
  });

  it('removes the timer on resolve so no fake timers remain pending', async () => {
    const promise = registry.register('q-1', { appId: 'app-1' }, 60_000);
    registry.resolve('q-1', 'ok');
    await expect(promise).resolves.toBe('ok');

    expect(vi.getTimerCount()).toBe(0);
  });

  it('removes the timer on reject so no fake timers remain pending', async () => {
    const promise = registry.register('q-1', { appId: 'app-1' }, 60_000);
    const exp = expect(promise).rejects.toBeInstanceOf(AgentQuestionCancelledError);
    registry.reject('q-1');
    await exp;

    expect(vi.getTimerCount()).toBe(0);
  });

  it('throws synchronously when registering a duplicate id', () => {
    void registry.register('q-1', { appId: 'app-1' }, 60_000).catch(() => undefined);
    expect(() => registry.register('q-1', { appId: 'app-1' }, 60_000)).toThrow(
      /already registered/
    );
    registry.reject('q-1');
  });

  it('resolve and reject for an unknown id are no-ops', () => {
    expect(() => registry.resolve('does-not-exist', 'whatever')).not.toThrow();
    expect(() => registry.reject('does-not-exist')).not.toThrow();
  });

  it('falls back to the default timeout when none is supplied', async () => {
    // Default is 30 minutes; verify that a sub-default tick does not fire
    // and the entry remains pending.
    const promise = registry.register('q-1', { appId: 'app-1' });
    const exp = expect(promise).rejects.toBeInstanceOf(AgentQuestionTimeoutError);

    vi.advanceTimersByTime(30 * 60 * 1000);
    await exp;
  });

  describe('answers written by another process', () => {
    const TIMEOUT_MS = 30 * 60 * 1000;
    let rows: Map<string, Partial<AgentQuestion>>;
    let repo: IAgentQuestionRepository;

    beforeEach(() => {
      rows = new Map([['q-x', { id: 'q-x', appId: 'app-1', status: AgentQuestionStatus.pending }]]);
      repo = {
        findById: vi.fn(
          async (_appId: string, id: string) => (rows.get(id) as AgentQuestion) ?? null
        ),
      } as unknown as IAgentQuestionRepository;
      registry = new DeferredQuestionRegistry(repo);
    });

    function answerInDb(status: AgentQuestionStatus, answer?: string): void {
      rows.set('q-x', { ...rows.get('q-x'), status, answer });
    }

    it('resolves when the question row is answered in the DB, without an in-process resolve()', async () => {
      const promise = registry.register('q-x', { appId: 'app-1' }, TIMEOUT_MS);
      let settled = false;
      void promise.then(() => (settled = true));

      answerInDb(AgentQuestionStatus.answered, 'from-cli');

      await vi.advanceTimersByTimeAsync(QUESTION_ANSWER_POLL_INTERVAL_MS - 1);
      expect(settled).toBe(false);
      await vi.advanceTimersByTimeAsync(1);

      await expect(promise).resolves.toBe('from-cli');
      expect(registry.has('q-x')).toBe(false);
      expect(vi.getTimerCount()).toBe(0);
    });

    it('rejects as cancelled when the row is cancelled elsewhere', async () => {
      const promise = registry.register('q-x', { appId: 'app-1' }, TIMEOUT_MS);
      const expectation = expect(promise).rejects.toBeInstanceOf(AgentQuestionCancelledError);

      answerInDb(AgentQuestionStatus.cancelled);
      await vi.advanceTimersByTimeAsync(QUESTION_ANSWER_POLL_INTERVAL_MS);

      await expectation;
      expect(vi.getTimerCount()).toBe(0);
    });

    it('rejects when the row expired elsewhere', async () => {
      const promise = registry.register('q-x', { appId: 'app-1' }, TIMEOUT_MS);
      const expectation = expect(promise).rejects.toBeInstanceOf(AgentQuestionCancelledError);

      answerInDb(AgentQuestionStatus.expired);
      await vi.advanceTimersByTimeAsync(QUESTION_ANSWER_POLL_INTERVAL_MS);

      await expectation;
    });

    it('keeps waiting while the row is pending and stops polling once settled in-process', async () => {
      const promise = registry.register('q-x', { appId: 'app-1' }, TIMEOUT_MS);
      await vi.advanceTimersByTimeAsync(QUESTION_ANSWER_POLL_INTERVAL_MS * 3);
      expect(registry.has('q-x')).toBe(true);
      expect(repo.findById).toHaveBeenCalledTimes(3);

      registry.resolve('q-x', 'local');
      await expect(promise).resolves.toBe('local');
      expect(vi.getTimerCount()).toBe(0);
    });

    it('keeps polling after a transient DB error', async () => {
      vi.mocked(repo.findById).mockRejectedValueOnce(new Error('SQLITE_BUSY'));
      const promise = registry.register('q-x', { appId: 'app-1' }, TIMEOUT_MS);

      await vi.advanceTimersByTimeAsync(QUESTION_ANSWER_POLL_INTERVAL_MS);
      answerInDb(AgentQuestionStatus.answered, 'late');
      await vi.advanceTimersByTimeAsync(QUESTION_ANSWER_POLL_INTERVAL_MS);

      await expect(promise).resolves.toBe('late');
    });
  });
});
