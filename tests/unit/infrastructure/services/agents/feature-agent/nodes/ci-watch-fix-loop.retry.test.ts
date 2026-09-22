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
