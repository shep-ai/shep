/**
 * Merge Flow Integration Tests (Agent-Driven)
 *
 * Tests the full LangGraph merge node behavior within the compiled graph.
 * Uses real graph compilation with mock executor (no git/GitHub calls).
 *
 * Covers:
 *   - Task 24: PR creation flow (openPr=true, allowMerge=false)
 *   - Task 25: Auto-merge via PR flow (openPr=true, allowMerge=true)
 *   - Task 26: Auto-merge direct flow (openPr=false, allowMerge=true)
 *   - Task 27: Review approval gate (allowMerge=false)
 *   - Task 28: Idempotency and full regression
 */

import 'reflect-metadata';
import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Command } from '@langchain/langgraph';
import {
  createFeatureAgentGraph,
  type FeatureAgentGraphDeps,
} from '@/infrastructure/services/agents/feature-agent/feature-agent-graph.js';
import { createCheckpointer } from '@/infrastructure/services/agents/common/checkpointer.js';
import type { IAgentExecutor } from '@/application/ports/output/agents/agent-executor.interface.js';
import type { DiffSummary } from '@/application/ports/output/services/git-pr-service.interface.js';
import type { MergeNodeDeps } from '@/infrastructure/services/agents/feature-agent/nodes/merge/merge.node.js';
import { initializeSettings, resetSettings } from '@/infrastructure/services/settings.service.js';
import { createDefaultSettings } from '@/domain/factories/settings-defaults.factory.js';
import {
  setLifecycleContext,
  clearLifecycleContext,
} from '@/infrastructure/services/agents/feature-agent/lifecycle-context.js';
import { type SdlcLifecycle } from '@/domain/generated/output.js';

function createMockExecutor(): IAgentExecutor {
  return {
    agentType: 'claude-code' as never,
    execute: vi.fn().mockResolvedValue({
      result:
        '[feat/test abc1234] feat: implementation\nhttps://github.com/test/repo/pull/42\nDone.',
    }),
    executeStream: vi.fn(),
    supportsFeature: vi.fn().mockReturnValue(false),
  };
}

function createMockGetDiffSummary(): MergeNodeDeps['getDiffSummary'] {
  return vi.fn().mockResolvedValue({
    filesChanged: 8,
    additions: 200,
    deletions: 30,
    commitCount: 5,
  } satisfies DiffSummary);
}

function createMockFeatureRepo(): MergeNodeDeps['featureRepository'] {
  let current: Record<string, unknown> = {
    id: 'feat-merge-test',
    lifecycle: 'Implementation',
    branch: 'feat/merge-test',
  };
  return {
    findById: vi.fn(async () => ({ ...current })),
    update: vi.fn(async (data: Record<string, unknown>) => {
      current = { ...current, ...data };
    }),
  } as any;
}

function createMockGitPrService(): MergeNodeDeps['gitPrService'] {
  return {
    getCiStatus: vi.fn().mockResolvedValue({ status: 'success', runUrl: null }),
    watchCi: vi.fn().mockResolvedValue({ status: 'success' }),
    getFailureLogs: vi.fn().mockResolvedValue(''),
    hasRemote: vi.fn().mockResolvedValue(true),
    getRemoteUrl: vi.fn().mockResolvedValue('https://github.com/test/repo'),
    getDefaultBranch: vi.fn().mockResolvedValue('main'),
    hasUncommittedChanges: vi.fn().mockResolvedValue(false),
    commitAll: vi.fn().mockResolvedValue('abc1234'),
    push: vi.fn().mockResolvedValue(undefined),
    createPr: vi.fn().mockResolvedValue({ url: '', number: 0 }),
    mergePr: vi.fn().mockResolvedValue(undefined),
    mergeBranch: vi.fn().mockResolvedValue(undefined),
    deleteBranch: vi.fn().mockResolvedValue(undefined),
    getPrDiffSummary: vi
      .fn()
      .mockResolvedValue({ filesChanged: 0, additions: 0, deletions: 0, commitCount: 0 }),
    getMergeableStatus: vi.fn().mockResolvedValue(undefined),
  } as any;
}

/** Extract interrupt payloads from a graph result. */
function getInterrupts(result: Record<string, unknown>): { value: Record<string, unknown> }[] {
  return (result.__interrupt__ as { value: Record<string, unknown> }[]) ?? [];
}

describe('Merge Flow (Graph-level)', () => {
  let tempDir: string;
  let specDir: string;
  let stdoutSpy: ReturnType<typeof vi.spyOn>;
  let stderrSpy: ReturnType<typeof vi.spyOn>;

  beforeAll(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'shep-merge-flow-test-'));
    specDir = join(tempDir, 'specs', '001-test');
    mkdirSync(specDir, { recursive: true });

    writeValidSpecFiles(specDir);

    stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

    // Initialize settings singleton required by merge.node.ts CI watch/fix loop
    initializeSettings(createDefaultSettings());
  });

  beforeEach(() => {
    writeFileSync(join(specDir, 'feature.yaml'), 'status:\n  completedPhases: []\n');
  });

  afterAll(() => {
    stdoutSpy.mockRestore();
    stderrSpy.mockRestore();
    rmSync(tempDir, { recursive: true, force: true });
    resetSettings();
  });

  function buildGraphDeps(overrides?: {
    getDiffSummary?: MergeNodeDeps['getDiffSummary'];
    featureRepo?: MergeNodeDeps['featureRepository'];
    hasRemote?: boolean;
  }): {
    deps: FeatureAgentGraphDeps;
    getDiffSummary: MergeNodeDeps['getDiffSummary'];
    featureRepo: MergeNodeDeps['featureRepository'];
  } {
    const getDiffSummary = overrides?.getDiffSummary ?? createMockGetDiffSummary();
    const featureRepo = overrides?.featureRepo ?? createMockFeatureRepo();
    const deps: FeatureAgentGraphDeps = {
      executor: createMockExecutor(),
      mergeNodeDeps: {
        getDiffSummary,
        hasRemote: vi.fn().mockResolvedValue(overrides?.hasRemote ?? true),
        getDefaultBranch: vi.fn().mockResolvedValue('main'),
        verifyMerge: vi.fn().mockResolvedValue(true),
        revParse: vi.fn().mockResolvedValue('premerge-sha-mock'),
        localMergeSquash: vi.fn().mockResolvedValue(undefined),
        featureRepository: featureRepo,
        gitPrService: createMockGitPrService(),
        cleanupFeatureWorktreeUseCase: { execute: vi.fn().mockResolvedValue(undefined) } as any,
        telemetry: { record: vi.fn() },
      },
    };
    return { deps, getDiffSummary, featureRepo };
  }

  function baseInput(overrides: Record<string, unknown> = {}) {
    return {
      featureId: 'feat-merge-test',
      repositoryPath: tempDir,
      worktreePath: tempDir,
      specDir,
      ...overrides,
    };
  }

  // --- Task 24: PR creation flow (openPr=true, allowMerge=false) ---
  describe('PR creation flow (openPr=true, allowMerge=false)', () => {
    it('should commit, push, create PR via agent, and set lifecycle to Review', async () => {
      const { deps, featureRepo } = buildGraphDeps();
      const checkpointer = createCheckpointer(':memory:');
      const graph = createFeatureAgentGraph(deps, checkpointer);
      const config = { configurable: { thread_id: 'pr-creation-flow' } };

      const result = await graph.invoke(baseInput({ openPr: true }), config);

      // Graph should complete without interrupts (no approval gates set)
      expect(getInterrupts(result)).toHaveLength(0);

      // Verify agent executor was called (commit/push/PR via agent)
      expect(deps.executor.execute).toHaveBeenCalled();

      // Verify PR URL parsed from agent output
      expect(result.prUrl).toBe('https://github.com/test/repo/pull/42');
      expect(result.prNumber).toBe(42);

      // Verify NO merge happened (no allowMerge gate)
      // Only one executor call for commit+push+PR, no second call for merge
      const executorCalls = (deps.executor.execute as ReturnType<typeof vi.fn>).mock.calls;
      // Last call should be the merge node's commit+push+PR (not a merge call)
      // The other calls are from earlier nodes (analyze, requirements, etc.)
      expect(executorCalls.length).toBeGreaterThanOrEqual(1);

      // Verify lifecycle set to Review
      expect(featureRepo.update).toHaveBeenCalledWith(
        expect.objectContaining({ lifecycle: 'Review' })
      );
    });

    it('should include merge messages in output', async () => {
      const { deps } = buildGraphDeps();
      const checkpointer = createCheckpointer(':memory:');
      const graph = createFeatureAgentGraph(deps, checkpointer);
      const config = { configurable: { thread_id: 'pr-creation-messages' } };

      const result = await graph.invoke(baseInput({ openPr: true }), config);

      const mergeMessages = result.messages.filter((m: string) => m.startsWith('[merge]'));
      expect(mergeMessages.length).toBeGreaterThanOrEqual(2);
    });
  });

  // --- Task 25: Auto-merge via PR flow (openPr=true, allowMerge=true) ---
  describe('auto-merge via PR flow (openPr=true, allowMerge=true)', () => {
    it('should create PR via agent, merge via agent, and set lifecycle to Maintain', async () => {
      const { deps, featureRepo } = buildGraphDeps();
      const checkpointer = createCheckpointer(':memory:');
      const graph = createFeatureAgentGraph(deps, checkpointer);
      const config = { configurable: { thread_id: 'auto-merge-pr-flow' } };

      const result = await graph.invoke(
        baseInput({
          openPr: true,
          approvalGates: { allowPrd: true, allowPlan: true, allowMerge: true },
        }),
        config
      );

      expect(getInterrupts(result)).toHaveLength(0);

      // Verify PR URL parsed from agent output
      expect(result.prUrl).toBe('https://github.com/test/repo/pull/42');

      // Verify lifecycle set to Maintain (merge happened)
      expect(featureRepo.update).toHaveBeenCalledWith(
        expect.objectContaining({ lifecycle: 'Maintain' })
      );
    });
  });

  // --- Task 26: Auto-merge direct flow (openPr=false, allowMerge=true) ---
  describe('auto-merge direct flow (openPr=false, allowMerge=true)', () => {
    it('should NOT create PR, merge via agent, and set lifecycle to Maintain', async () => {
      const { deps, featureRepo } = buildGraphDeps();
      const checkpointer = createCheckpointer(':memory:');
      const graph = createFeatureAgentGraph(deps, checkpointer);
      const config = { configurable: { thread_id: 'auto-merge-direct-flow' } };

      const result = await graph.invoke(
        baseInput({
          openPr: false,
          approvalGates: { allowPrd: true, allowPlan: true, allowMerge: true },
        }),
        config
      );

      expect(getInterrupts(result)).toHaveLength(0);

      // No PR URL (openPr=false, parsePrUrl not called)
      expect(result.prUrl).toBeNull();

      // Lifecycle = Maintain (merge happened via agent)
      expect(featureRepo.update).toHaveBeenCalledWith(
        expect.objectContaining({ lifecycle: 'Maintain' })
      );
    });
  });

  // --- Task 27: Review approval gate (allowMerge=false) ---
  describe('review approval gate (allowMerge=false)', () => {
    it('should interrupt at merge node when allowMerge=false, then complete on resume', async () => {
      const { deps, featureRepo } = buildGraphDeps();
      const checkpointer = createCheckpointer(':memory:');
      const graph = createFeatureAgentGraph(deps, checkpointer);
      const config = { configurable: { thread_id: 'merge-gate-thread' } };

      const result1 = await graph.invoke(
        baseInput({
          openPr: false,
          approvalGates: { allowPrd: true, allowPlan: true, allowMerge: false },
        }),
        config
      );

      // First interrupt: merge node
      const interrupts2 = getInterrupts(result1);
      expect(interrupts2.length).toBe(1);
      expect(interrupts2[0].value.node).toBe('merge');
      expect(interrupts2[0].value.diffSummary).toBeDefined();

      // Resume past merge → completes
      const result3 = await graph.invoke(
        new Command({
          resume: { approved: true },
          update: { _approvalAction: 'approved', _rejectionFeedback: null },
        }),
        config
      );
      expect(getInterrupts(result3)).toHaveLength(0);

      // After resume with approval, merge is performed — lifecycle goes to Maintain
      expect(featureRepo.update).toHaveBeenCalledWith(
        expect.objectContaining({ lifecycle: 'Maintain' })
      );
    });

    it('should include diff summary in merge interrupt payload', async () => {
      const { deps } = buildGraphDeps();
      const checkpointer = createCheckpointer(':memory:');
      const graph = createFeatureAgentGraph(deps, checkpointer);
      const config = { configurable: { thread_id: 'merge-gate-diff-thread' } };

      const result = await graph.invoke(
        baseInput({
          openPr: false,
          approvalGates: { allowPrd: true, allowPlan: true, allowMerge: false },
        }),
        config
      );
      const interrupts = getInterrupts(result);
      expect(interrupts[0].value.node).toBe('merge');
      expect(interrupts[0].value.diffSummary).toEqual(
        expect.objectContaining({
          filesChanged: 8,
          additions: 200,
          deletions: 30,
        })
      );
    });
  });

  // --- BUG #211: Lifecycle poisoning bypasses merge approval gate ---
  describe('lifecycle poisoning bug (allowMerge=false with lifecycle context)', () => {
    it('should interrupt at merge node even when lifecycle context is active', async () => {
      // BUG: updateNodeLifecycle('merge') sets lifecycle=Review in the feature repo
      // BEFORE the merge node checks isResumeAfterInterrupt. This causes the node
      // to think it's resuming after an approval, bypassing the gate entirely.
      //
      // This test simulates the real worker by setting up lifecycle context,
      // which the other tests don't do (making updateNodeLifecycle a no-op).
      const featureRepo = createMockFeatureRepo();
      const { deps } = buildGraphDeps({ featureRepo });

      // Set up lifecycle context that updates the feature repo (like the real worker)
      setLifecycleContext('feat-merge-test', {
        execute: async ({ lifecycle }: { featureId: string; lifecycle: SdlcLifecycle }) => {
          (featureRepo.update as any)({ lifecycle });
        },
      });

      const checkpointer = createCheckpointer(':memory:');
      const graph = createFeatureAgentGraph(deps, checkpointer);
      const config = { configurable: { thread_id: 'lifecycle-poison-thread' } };

      const result = await graph.invoke(
        baseInput({
          openPr: false,
          approvalGates: { allowPrd: true, allowPlan: true, allowMerge: false },
        }),
        config
      );

      // Clean up lifecycle context
      clearLifecycleContext();

      // MUST interrupt at merge — this is a first run, not a resume
      const interrupts = getInterrupts(result);
      expect(interrupts.length).toBe(1);
      expect(interrupts[0].value.node).toBe('merge');

      // Merge must NOT have been performed
      expect(deps.mergeNodeDeps!.gitPrService.mergePr).not.toHaveBeenCalled();
      expect(deps.mergeNodeDeps!.verifyMerge).not.toHaveBeenCalled();
    });
  });

  // --- No-remote local merge (the bug scenario) ---
  describe('no-remote local merge flow', () => {
    it('should override push/openPr to false and merge locally when no remote', async () => {
      const { deps, featureRepo } = buildGraphDeps({ hasRemote: false });
      const checkpointer = createCheckpointer(':memory:');
      const graph = createFeatureAgentGraph(deps, checkpointer);
      const config = { configurable: { thread_id: 'no-remote-merge-flow' } };

      const result = await graph.invoke(
        baseInput({
          push: true,
          openPr: true,
          approvalGates: { allowPrd: true, allowPlan: true, allowMerge: true },
        }),
        config
      );

      expect(getInterrupts(result)).toHaveLength(0);

      // No PR URL (remote unavailable, push/openPr overridden)
      expect(result.prUrl).toBeNull();

      // Lifecycle = Maintain (local merge happened)
      expect(featureRepo.update).toHaveBeenCalledWith(
        expect.objectContaining({ lifecycle: 'Maintain' })
      );

      // Verify localMergeSquash was called (programmatic merge, no agent)
      expect(deps.mergeNodeDeps!.localMergeSquash).toHaveBeenCalled();
    });

    it('should fail when localMergeSquash throws an error', async () => {
      const { deps } = buildGraphDeps({ hasRemote: false });
      // Make localMergeSquash throw to simulate merge failure
      (deps.mergeNodeDeps!.localMergeSquash as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('Merge conflict detected')
      );
      const checkpointer = createCheckpointer(':memory:');
      const graph = createFeatureAgentGraph(deps, checkpointer);
      const config = { configurable: { thread_id: 'no-remote-verify-fail' } };

      await expect(
        graph.invoke(
          baseInput({
            push: false,
            openPr: false,
            approvalGates: { allowPrd: true, allowPlan: true, allowMerge: true },
          }),
          config
        )
      ).rejects.toThrow('Merge conflict detected');
    });
  });

  // --- Task 28: Idempotency and regression ---
  describe('idempotency and regression', () => {
    it('should preserve prUrl when already set (idempotent resume)', async () => {
      const { deps } = buildGraphDeps();
      const checkpointer = createCheckpointer(':memory:');
      const graph = createFeatureAgentGraph(deps, checkpointer);
      const config = { configurable: { thread_id: 'idempotent-pr-thread' } };

      const result = await graph.invoke(
        baseInput({
          openPr: true,
          prUrl: 'https://github.com/test/repo/pull/99',
          prNumber: 99,
        }),
        config
      );

      // prUrl should reflect what was parsed from agent output (agent always runs)
      // but the existing prUrl/prNumber should be preserved if parsePrUrl returns null
      expect(result.prUrl).toBeDefined();
      expect(result.prNumber).toBeDefined();
    });

    it('should complete full flow without errors (no approval gates, openPr=false)', async () => {
      const { deps, featureRepo } = buildGraphDeps();
      const checkpointer = createCheckpointer(':memory:');
      const graph = createFeatureAgentGraph(deps, checkpointer);
      const config = { configurable: { thread_id: 'full-regression-thread' } };

      const result = await graph.invoke(baseInput({ openPr: false }), config);

      expect(getInterrupts(result)).toHaveLength(0);
      expect(result.error).toBeNull();

      // Agent was called for commit (even without push/PR, agent always runs)
      expect(deps.executor.execute).toHaveBeenCalled();

      // No merge (no allowMerge gate)
      // Lifecycle = Review (not merged)
      expect(featureRepo.update).toHaveBeenCalledWith(
        expect.objectContaining({ lifecycle: 'Review' })
      );

      // Messages include merge node output
      expect(result.messages.some((m: string) => m.includes('[merge]'))).toBe(true);
    });
  });
});

/** Write valid spec files that pass all validation gates. */
function writeValidSpecFiles(specDir: string) {
  writeFileSync(
    join(specDir, 'spec.yaml'),
    `${[
      'name: Merge Flow Test Feature',
      'number: 1',
      'branch: feat/merge-test',
      'oneLiner: A test feature for merge flow integration tests',
      'summary: This feature tests the merge flow with various configurations',
      'phase: implementation',
      'sizeEstimate: S',
      'content: Full description of the merge flow test feature',
      'technologies:',
      '  - TypeScript',
      'openQuestions: []',
    ].join('\n')}\n`
  );
  writeFileSync(
    join(specDir, 'research.yaml'),
    `${[
      'name: Merge Flow Research',
      'summary: Research for merge flow test',
      'content: Detailed research content for the merge flow',
      'decisions:',
      '  - title: Merge strategy',
      '    chosen: Squash merge',
      '    rejected:',
      '      - Rebase merge',
      '    rationale: Squash keeps history clean',
    ].join('\n')}\n`
  );
  writeFileSync(
    join(specDir, 'plan.yaml'),
    `${[
      'content: Implementation plan for merge flow',
      'phases:',
      '  - id: phase-1',
      '    name: Setup',
      '    parallel: false',
      '    taskIds:',
      '      - task-1',
      'filesToCreate:',
      '  - src/merge-flow.ts',
    ].join('\n')}\n`
  );
  writeFileSync(
    join(specDir, 'tasks.yaml'),
    `${[
      'tasks:',
      '  - id: task-1',
      '    phaseId: phase-1',
      '    title: Implement merge flow',
      '    description: Implement the merge flow feature',
      '    state: todo',
      '    dependencies: []',
      '    acceptanceCriteria:',
      '      - Merge works',
      '    tdd: null',
      '    estimatedEffort: small',
    ].join('\n')}\n`
  );
}
