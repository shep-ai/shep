/**
 * remediate node unit tests.
 *
 * Always increments remediationAttempts. With no executor it degrades
 * (failureReason preserved so the graph terminates after ensure_infra).
 * With an executor it invalidates the cached run plan (next start
 * re-analyzes), runs the remediation agent, and on success EXPLICITLY
 * clears failureReason (null overwrite — the graph then retries).
 */

import 'reflect-metadata';
import { describe, it, expect, vi } from 'vitest';
import { RunPlanSource, type DevServerRunPlan } from '@/domain/generated/output.js';
import type { IAgentExecutor } from '@/application/ports/output/agents/agent-executor.interface.js';
import type { DevServerAgentState } from '@/infrastructure/services/agents/dev-server-agent/state.js';
import {
  createRemediateNode,
  type RemediateNodeDeps,
} from '@/infrastructure/services/agents/dev-server-agent/nodes/remediate.node.js';

const FAILURE = 'Dev server did not become ready within 90000ms';

function makePlan(overrides: Partial<DevServerRunPlan> = {}): DevServerRunPlan {
  const now = new Date();
  return {
    repoPath: '/repo',
    source: RunPlanSource.Agent,
    command: 'pnpm dev',
    cwd: '/repo/apps/web',
    setupCommands: [],
    configHash: 'hash-1',
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function makeState(overrides: Partial<DevServerAgentState> = {}): DevServerAgentState {
  return {
    targetId: 'app-1',
    targetType: 'application',
    targetPath: '/repo',
    runPlan: makePlan(),
    infraReady: true,
    depsInstalled: true,
    resultUrl: null,
    failureReason: FAILURE,
    remediationAttempts: 0,
    lastErrorTail: ['Error: listen EADDRINUSE :::3000'],
    capturedLogs: [],
    degraded: false,
    ...overrides,
  };
}

function makeExecutor(overrides: Partial<IAgentExecutor> = {}): IAgentExecutor {
  return {
    agentType: 'claude-code',
    execute: vi.fn(() => Promise.resolve({ result: 'fixed' })),
    executeStream: vi.fn(),
    supportsFeature: vi.fn(() => false),
    ...overrides,
  } as unknown as IAgentExecutor;
}

function makeDeps(overrides: Partial<RemediateNodeDeps> = {}): RemediateNodeDeps {
  return {
    executor: makeExecutor(),
    runPlanRepository: { deleteByRepoPath: vi.fn(() => Promise.resolve()) },
    log: vi.fn(),
    ...overrides,
  };
}

describe('createRemediateNode', () => {
  describe('no executor (degraded)', () => {
    it('preserves failureReason, marks degraded, and still increments attempts', async () => {
      const deps = makeDeps({ executor: null });
      const node = createRemediateNode(deps);

      const result = await node(makeState({ remediationAttempts: 0 }));

      expect(result.remediationAttempts).toBe(1);
      expect(result.degraded).toBe(true);
      // failureReason must NOT be cleared — omitting the channel keeps the
      // previous value via the reducer, so the key must be absent.
      expect(result).not.toHaveProperty('failureReason');
      expect(deps.log).toHaveBeenCalledWith('no agent available for remediation');
    });

    it('does not invalidate the cached run plan', async () => {
      const deps = makeDeps({ executor: null });
      const node = createRemediateNode(deps);

      await node(makeState());

      expect(deps.runPlanRepository.deleteByRepoPath).not.toHaveBeenCalled();
    });
  });

  describe('successful remediation', () => {
    it('explicitly clears failureReason (null) and lastErrorTail, increments attempts', async () => {
      const deps = makeDeps();
      const node = createRemediateNode(deps);

      const result = await node(makeState({ remediationAttempts: 0 }));

      expect(result.remediationAttempts).toBe(1);
      expect(result).toHaveProperty('failureReason', null);
      expect(result.lastErrorTail).toEqual([]);
      expect(result).not.toHaveProperty('degraded');
    });

    it('invalidates the cached run plan with the target path before executing', async () => {
      const deps = makeDeps();
      const node = createRemediateNode(deps);

      await node(makeState());

      expect(deps.runPlanRepository.deleteByRepoPath).toHaveBeenCalledWith('/repo');
      const deleteOrder = vi.mocked(deps.runPlanRepository.deleteByRepoPath).mock
        .invocationCallOrder[0];
      const executeOrder = vi.mocked(deps.executor!.execute).mock.invocationCallOrder[0];
      expect(deleteOrder).toBeLessThan(executeOrder);
    });

    it('executes the remediation prompt in the target path with timeout and silent', async () => {
      const deps = makeDeps();
      const node = createRemediateNode(deps);

      await node(makeState());

      expect(deps.executor!.execute).toHaveBeenCalledTimes(1);
      const [prompt, options] = vi.mocked(deps.executor!.execute).mock.calls[0];
      expect(prompt).toContain('pnpm dev');
      expect(prompt).toContain(FAILURE);
      expect(options).toEqual({ cwd: '/repo', timeout: 300_000, silent: true });
    });

    it('honors a custom timeoutMs', async () => {
      const deps = makeDeps({ timeoutMs: 60_000 });
      const node = createRemediateNode(deps);

      await node(makeState());

      const [, options] = vi.mocked(deps.executor!.execute).mock.calls[0];
      expect(options?.timeout).toBe(60_000);
    });

    it('builds the prompt from targetPath when no run plan exists', async () => {
      const deps = makeDeps();
      const node = createRemediateNode(deps);

      await node(makeState({ runPlan: null }));

      const [prompt, options] = vi.mocked(deps.executor!.execute).mock.calls[0];
      expect(prompt).toContain('/repo');
      expect(options?.cwd).toBe('/repo');
    });
  });

  describe('failed remediation', () => {
    it('keeps failureReason set when the executor throws (run terminates after ensure_infra)', async () => {
      const deps = makeDeps({
        executor: makeExecutor({
          execute: vi.fn(() => Promise.reject(new Error('agent crashed'))),
        }),
      });
      const node = createRemediateNode(deps);

      const result = await node(makeState({ remediationAttempts: 1 }));

      expect(result.remediationAttempts).toBe(2);
      expect(result).not.toHaveProperty('failureReason');
      expect(result).not.toHaveProperty('lastErrorTail');
    });

    it('swallows and logs a run-plan cache invalidation failure', async () => {
      const deps = makeDeps({
        runPlanRepository: {
          deleteByRepoPath: vi.fn(() => Promise.reject(new Error('db locked'))),
        },
      });
      const node = createRemediateNode(deps);

      const result = await node(makeState());

      // Remediation still proceeds and succeeds.
      expect(deps.executor!.execute).toHaveBeenCalledTimes(1);
      expect(result).toHaveProperty('failureReason', null);
      expect(deps.log).toHaveBeenCalledWith(expect.stringContaining('db locked'));
    });
  });

  it('increments attempts from the current state on every path', async () => {
    const degraded = createRemediateNode(makeDeps({ executor: null }));
    const success = createRemediateNode(makeDeps());
    const failing = createRemediateNode(
      makeDeps({
        executor: makeExecutor({ execute: vi.fn(() => Promise.reject(new Error('nope'))) }),
      })
    );

    expect((await degraded(makeState({ remediationAttempts: 1 }))).remediationAttempts).toBe(2);
    expect((await success(makeState({ remediationAttempts: 1 }))).remediationAttempts).toBe(2);
    expect((await failing(makeState({ remediationAttempts: 1 }))).remediationAttempts).toBe(2);
  });
});
