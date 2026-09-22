/**
 * CI watch retry budget.
 *
 * The CI watch agent call ran with `maxAttempts: 1`, so a single transient
 * executor error (an API 5xx, a dropped connection) was reported as CI
 * status `failure` — spending a CI-fix attempt on a green build — and a
 * "network timed out" error ended the merge as a CI timeout. The watch now
 * uses retryExecute's default budget; this runs the real retryExecute.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/infrastructure/services/settings.service.js', () => ({
  getSettings: () => ({
    workflow: { ciMaxFixAttempts: 3, ciWatchTimeoutMs: 600_000, ciLogMaxChars: 50_000 },
  }),
}));

vi.mock('@/infrastructure/services/agents/feature-agent/phase-timing-context.js', () => ({
  recordPhaseStart: vi.fn().mockResolvedValue('timing-1'),
  recordPhaseEnd: vi.fn().mockResolvedValue(undefined),
}));

import { runCiWatchFixLoop } from '@/infrastructure/services/agents/feature-agent/nodes/merge/ci-watch-fix-loop.js';
import { CiStatus } from '@/domain/generated/output.js';
import type { IAgentExecutor } from '@/application/ports/output/agents/agent-executor.interface.js';
import type { IGitPrService } from '@/application/ports/output/services/git-pr-service.interface.js';

const RUN_URL = 'https://github.com/org/repo/actions/runs/1';

function makeDeps(execute: ReturnType<typeof vi.fn>) {
  const executor = { agentType: 'claude-code', execute } as unknown as IAgentExecutor;
  const gitPrService = {
    getCiStatus: vi.fn().mockResolvedValue({ status: 'pending', runUrl: RUN_URL }),
    getFailureLogs: vi.fn().mockResolvedValue('logs'),
  } as unknown as IGitPrService;
  const featureRepository = { findById: vi.fn(), update: vi.fn() };
  return { executor, gitPrService, featureRepository };
}

function makeParams() {
  return {
    cwd: '/tmp/worktree',
    branch: 'feat/x',
    options: { cwd: '/tmp/worktree' },
    feature: null,
    prUrl: null,
    prNumber: null,
    existingAttempts: 0,
    messages: [] as string[],
    log: { activate: vi.fn(), info: vi.fn(), error: vi.fn() } as never,
    repositoryPath: '/repo',
  };
}

describe('runCiWatchFixLoop — CI watch retry budget', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it.each([
    ['a transient API error', 'API Error: 529 {"type":"overloaded_error"}'],
    ['a transient network timeout', 'ETIMEDOUT: network timed out'],
  ])('takes the CI status from the retry after %s', async (_label, message) => {
    const execute = vi
      .fn()
      .mockRejectedValueOnce(new Error(message))
      .mockResolvedValueOnce({ result: 'CI_STATUS: PASSED' });
    const deps = makeDeps(execute);

    const pending = runCiWatchFixLoop(deps, makeParams());
    await vi.runAllTimersAsync();
    const result = await pending;

    expect(execute).toHaveBeenCalledTimes(2);
    expect(result.ciStatus).toBe(CiStatus.Success);
    expect(result.ciFixAttempts).toBe(0);
    expect(deps.gitPrService.getFailureLogs).not.toHaveBeenCalled();
  });
});

/**
 * CI fix retry budget.
 *
 * The fix call ran with `maxAttempts: 1`, so a single API 5xx before the fix
 * agent finished burned one of the (default three) CI-fix attempts without
 * the agent ever changing a line. It now retries transient API/network
 * errors with the default budget — and ONLY those: an unknown failure may
 * have come after the agent pushed a partial fix, and that must be judged by
 * the next CI watch, not repeated blind.
 */
describe('runCiWatchFixLoop — CI fix retry budget', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  const WATCH_FAILED = { result: 'CI_STATUS: FAILED — lint failed' };
  const WATCH_PASSED = { result: 'CI_STATUS: PASSED' };
  const FIXED = { result: 'Pushed a fix' };

  it.each([
    ['a transient API error', 'API Error: 529 {"type":"overloaded_error"}'],
    ['a dropped connection', 'connect ECONNREFUSED 104.18.6.192:443'],
  ])('re-runs the fix after %s without spending a fix attempt', async (_label, message) => {
    const execute = vi
      .fn()
      .mockResolvedValueOnce(WATCH_FAILED) // initial watch
      .mockRejectedValueOnce(new Error(message)) // fix, transient failure
      .mockResolvedValueOnce(FIXED) // fix, retried
      .mockResolvedValueOnce(WATCH_PASSED); // watch after fix
    const deps = makeDeps(execute);

    const pending = runCiWatchFixLoop(deps, makeParams());
    await vi.runAllTimersAsync();
    const result = await pending;

    expect(execute).toHaveBeenCalledTimes(4);
    expect(result.ciStatus).toBe(CiStatus.Success);
    expect(result.ciFixAttempts).toBe(1);
    expect(result.ciFixHistory).toEqual([
      expect.objectContaining({ attempt: 1, outcome: 'fixed' }),
    ]);
  });

  it('does not re-run the fix after an unrecognised failure', async () => {
    const execute = vi
      .fn()
      .mockResolvedValueOnce(WATCH_FAILED) // initial watch
      .mockRejectedValueOnce(new Error('Something completely unexpected happened')) // fix
      .mockResolvedValueOnce(FIXED) // next fix attempt
      .mockResolvedValueOnce(WATCH_PASSED); // watch after fix
    const deps = makeDeps(execute);

    const pending = runCiWatchFixLoop(deps, makeParams());
    await vi.runAllTimersAsync();
    const result = await pending;

    expect(result.ciFixAttempts).toBe(2);
    expect(result.ciFixHistory[0]).toEqual(
      expect.objectContaining({ attempt: 1, outcome: 'failed' })
    );
    expect(result.ciFixHistory[0].failureSummary).toMatch(/Something completely unexpected/);
  });
});
