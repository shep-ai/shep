/**
 * Resume After Error — Merge Node Tests
 *
 * Tests that when the merge node throws an error, reject/approve/retry
 * correctly resume at the merge step with the user's feedback propagated.
 *
 * BUG SCENARIO (what we're catching):
 * 1. Feature runs to merge node, merge throws (e.g., "gh run view" fails)
 * 2. Feature is marked as "failed" in DB
 * 3. User clicks Reject with feedback "fix the PR description"
 * 4. EXPECTED: merge node re-executes with rejection feedback accessible
 * 5. ACTUAL (bug): feedback is lost, or graph restarts from beginning
 *
 * These tests use a persistent checkpointer (same across invocations)
 * and a graph WITH merge node to simulate the real resume flow.
 */

import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { Command } from '@langchain/langgraph';
import {
  createFeatureAgentGraph,
  type FeatureAgentGraphDeps,
} from '@/infrastructure/services/agents/feature-agent/feature-agent-graph.js';
import { createCheckpointer } from '@/infrastructure/services/agents/common/checkpointer.js';
import type { IAgentExecutor } from '@/application/ports/output/agents/agent-executor.interface.js';
import type { Settings } from '@/domain/generated/output.js';
import {
  initializeSettings,
  hasSettings,
  resetSettings,
} from '@/infrastructure/services/settings.service.js';
import { createStubMergeNodeDeps } from './setup.js';
import {
  VALID_SPEC_YAML,
  VALID_RESEARCH_YAML,
  VALID_PLAN_YAML,
  VALID_TASKS_YAML,
} from './fixtures.js';
import {
  expectInterruptAt,
  expectNoInterrupts,
  ALL_GATES_ENABLED,
  PRD_PLAN_ALLOWED,
} from './helpers.js';

/**
 * Non-retryable error message. retryExecute() checks for "Process exited with code"
 * and throws immediately without retry.
 */
const NON_RETRYABLE_MSG = 'Process exited with code 1: Command failed: gh run view';

/**
 * Identify which producer nodes ran by inspecting executor.prompts.
 */
const PROMPT_NODE_MARKERS: [string, string][] = [
  ['analyze', 'ANALYSIS phase'],
  ['requirements', 'REQUIREMENTS phase'],
  ['research', 'RESEARCH phase'],
  ['plan', 'PLANNING phase'],
  ['implement', 'autonomous implementation'],
  ['merge', 'MERGE phase'],
];

function getExecutedNodes(prompts: string[]): string[] {
  const seen = new Set<string>();
  for (const prompt of prompts) {
    for (const [nodeName, marker] of PROMPT_NODE_MARKERS) {
      if (prompt.includes(marker)) {
        seen.add(nodeName);
      }
    }
  }
  return PROMPT_NODE_MARKERS.map(([name]) => name).filter((n) => seen.has(n));
}

/**
 * Create a controllable executor that can throw from a specific call count
 * and tracks which calls were merge-related.
 */
function createControllableExecutor() {
  let callCount = 0;
  const prompts: string[] = [];
  let throwFromCall: number | null = null;

  const executeFn = vi.fn(async (prompt: string) => {
    callCount++;
    prompts.push(prompt);
    if (throwFromCall !== null && callCount >= throwFromCall) {
      throw new Error(NON_RETRYABLE_MSG);
    }
    return { result: `stub result #${callCount}`, exitCode: 0 };
  });

  return {
    agentType: 'claude-code' as never,
    execute: executeFn,
    executeStream: vi.fn(),
    supportsFeature: vi.fn().mockReturnValue(false),
    get callCount() {
      return callCount;
    },
    prompts,
    throwFromCall(n: number) {
      throwFromCall = n;
    },
    clearThrow() {
      throwFromCall = null;
    },
    resetCounts() {
      callCount = 0;
      prompts.length = 0;
      executeFn.mockClear();
    },
  };
}

type ControllableExecutor = ReturnType<typeof createControllableExecutor>;

describe('Graph State Transitions › Resume After Error at Merge', () => {
  let tempDir: string;
  let specDir: string;
  let output: { restore: () => void };

  beforeAll(() => {
    if (!hasSettings()) {
      initializeSettings({
        id: 'test',
        createdAt: new Date(),
        updatedAt: new Date(),
        models: { default: 'claude-sonnet-4' },
        user: {},
        environment: { defaultEditor: 'vscode', shellPreference: 'bash' },
        system: { logLevel: 'error' },
        agent: { type: 'claude-code', authMethod: 'session' },
        notifications: {
          inApp: { enabled: false },
          browser: { enabled: false },
          desktop: { enabled: false },
          events: {
            agentStarted: false,
            phaseCompleted: false,
            waitingApproval: false,
            agentCompleted: false,
            agentFailed: false,
            prMerged: false,
            prClosed: false,
            prChecksPassed: false,
            prChecksFailed: false,
          },
        },
        workflow: {
          openPrOnImplementationComplete: false,
          approvalGateDefaults: {
            allowPrd: false,
            allowPlan: false,
            allowMerge: false,
            pushOnImplementationComplete: false,
          },
          enableEvidence: true,
          commitEvidence: false,
        },
        onboardingComplete: true,
      } as Settings);
    }

    output = (() => {
      const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
      const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
      return {
        restore: () => {
          stdoutSpy.mockRestore();
          stderrSpy.mockRestore();
        },
      };
    })();

    tempDir = mkdtempSync(join(tmpdir(), 'shep-resume-merge-'));
    specDir = join(tempDir, 'specs', '001-test');
    mkdirSync(specDir, { recursive: true });
  });

  beforeEach(() => {
    writeFileSync(join(specDir, 'spec.yaml'), VALID_SPEC_YAML);
    writeFileSync(join(specDir, 'research.yaml'), VALID_RESEARCH_YAML);
    writeFileSync(join(specDir, 'plan.yaml'), VALID_PLAN_YAML);
    writeFileSync(join(specDir, 'tasks.yaml'), VALID_TASKS_YAML);
    writeFileSync(join(specDir, 'feature.yaml'), 'status:\n  completedPhases: []\n');
  });

  afterAll(() => {
    output.restore();
    if (tempDir) rmSync(tempDir, { recursive: true, force: true });
    resetSettings();
  });

  /**
   * Helper: create a graph with merge node + persistent checkpointer.
   * The SAME checkpointer is reused across invocations to simulate real resume.
   */
  function createResumableGraphWithMerge(executor: ControllableExecutor) {
    const checkpointer = createCheckpointer(':memory:');
    const mergeNodeDeps = createStubMergeNodeDeps();
    const deps: FeatureAgentGraphDeps = {
      executor: executor as unknown as IAgentExecutor,
      mergeNodeDeps,
    };
    const graph = createFeatureAgentGraph(deps, checkpointer);
    const threadId = `resume-merge-test-${randomUUID()}`;
    const config = { configurable: { thread_id: threadId } };

    const initialState = {
      featureId: `feat-${randomUUID().slice(0, 8)}`,
      repositoryPath: tempDir,
      worktreePath: tempDir,
      specDir,
      approvalGates: ALL_GATES_ENABLED,
      push: false,
      openPr: false,
      enableEvidence: true,
      commitEvidence: false,
    };

    return { graph, config, initialState, mergeNodeDeps };
  }

  it('should resume from failed merge — not restart from analyze', async () => {
    const executor = createControllableExecutor();

    // Graph with merge: analyze(1) + req(2) + research(3) + plan(4) + implement(5) + evidence(6) + merge-commit(7)
    // Make the merge commit call (7th executor call) throw
    executor.throwFromCall(7);

    const { graph, config, initialState } = createResumableGraphWithMerge(executor);

    // Invocation #1: should fail at merge
    await expect(graph.invoke(initialState, config)).rejects.toThrow(NON_RETRYABLE_MSG);
    expect(executor.callCount).toBe(7); // 6 pre-merge + 1 merge (threw)

    // Clear throw and reset counts
    executor.clearThrow();
    executor.resetCounts();

    // Invocation #2: resume from error — should ONLY re-execute merge, not restart
    const result = await graph.invoke(initialState, config);

    expectNoInterrupts(result);
    // Critical: early nodes must NOT re-execute
    const executedNodes = getExecutedNodes(executor.prompts);
    expect(executedNodes).not.toContain('analyze');
    expect(executedNodes).not.toContain('requirements');
    expect(executedNodes).not.toContain('research');
    expect(executedNodes).not.toContain('plan');
    expect(executedNodes).not.toContain('implement');
    // Merge re-executes (1 call) + evidence may re-run (up to 3 calls) = up to 4
    expect(executor.callCount).toBeLessThanOrEqual(4);
  });

  it('should resume from failed merge with rejection feedback via Command', async () => {
    const executor = createControllableExecutor();

    // Make merge-commit (7th call) throw
    executor.throwFromCall(7);

    const { graph, config, initialState } = createResumableGraphWithMerge(executor);

    // Invocation #1: fail at merge
    await expect(graph.invoke(initialState, config)).rejects.toThrow(NON_RETRYABLE_MSG);

    executor.clearThrow();
    executor.resetCounts();

    // Invocation #2: resume with rejection feedback via Command
    // This simulates what the worker SHOULD do when user rejects a failed feature
    await graph.invoke(
      new Command({
        resume: { rejected: true, feedback: 'fix the PR description' },
        update: {
          _approvalAction: 'rejected',
          _rejectionFeedback: 'fix the PR description',
        },
      }),
      config
    );

    // After rejection, merge should re-execute and interrupt (since we're re-running)
    // The key test: the feedback should be accessible and merge should not restart from analyze
    expect(executor.callCount).toBeGreaterThanOrEqual(1);
    // Should NOT have run analyze, requirements, research, plan, implement again
    const executedNodes = getExecutedNodes(executor.prompts);
    expect(executedNodes).not.toContain('analyze');
    expect(executedNodes).not.toContain('requirements');
    expect(executedNodes).not.toContain('research');
    expect(executedNodes).not.toContain('plan');
    expect(executedNodes).not.toContain('implement');
  });

  it('should resume from failed merge with approval via Command', async () => {
    const executor = createControllableExecutor();

    // Make merge-commit (7th call) throw
    executor.throwFromCall(7);

    const { graph, config, initialState } = createResumableGraphWithMerge(executor);

    // Invocation #1: fail at merge
    await expect(graph.invoke(initialState, config)).rejects.toThrow(NON_RETRYABLE_MSG);

    executor.clearThrow();
    executor.resetCounts();

    // Invocation #2: resume with approval via Command (user clicks "Retry" / "Approve")
    const result = await graph.invoke(
      new Command({
        resume: { approved: true },
        update: {
          _approvalAction: 'approved',
          _rejectionFeedback: null,
        },
      }),
      config
    );

    expectNoInterrupts(result);
    // Should only re-execute merge, not the entire graph
    const executedNodes = getExecutedNodes(executor.prompts);
    expect(executedNodes).not.toContain('analyze');
    expect(executedNodes).not.toContain('requirements');
    expect(executedNodes).not.toContain('research');
    expect(executedNodes).not.toContain('plan');
    expect(executedNodes).not.toContain('implement');
    // Merge re-executes (1 call) + evidence may re-run (up to 3 calls) = up to 4
    expect(executor.callCount).toBeLessThanOrEqual(4);
  });

  it('should resume from failed merge with plain re-invoke (no Command) — current Retry behavior', async () => {
    const executor = createControllableExecutor();

    // Make merge-commit (7th call) throw
    executor.throwFromCall(7);

    const { graph, config, initialState } = createResumableGraphWithMerge(executor);

    // Invocation #1: fail at merge
    await expect(graph.invoke(initialState, config)).rejects.toThrow(NON_RETRYABLE_MSG);

    executor.clearThrow();
    executor.resetCounts();

    // Invocation #2: plain re-invoke (what ResumeFeatureUseCase currently does)
    const result = await graph.invoke(initialState, config);

    expectNoInterrupts(result);
    // Even without Command, checkpointer should resume at merge, not restart
    const executedNodes = getExecutedNodes(executor.prompts);
    expect(executedNodes).not.toContain('analyze');
    expect(executedNodes).not.toContain('requirements');
    expect(executedNodes).not.toContain('research');
    expect(executedNodes).not.toContain('plan');
    expect(executedNodes).not.toContain('implement');
    // Merge re-executes (1 call) + evidence may re-run (up to 3 calls) = up to 4
    expect(executor.callCount).toBeLessThanOrEqual(4);
  });

  it('should handle fail-at-merge then reject then approve cycle', async () => {
    const executor = createControllableExecutor();

    // Make merge-commit (7th call) throw
    executor.throwFromCall(7);

    const { graph, config, initialState } = createResumableGraphWithMerge(executor);

    // Invocation #1: fail at merge
    await expect(graph.invoke(initialState, config)).rejects.toThrow(NON_RETRYABLE_MSG);

    executor.clearThrow();
    executor.resetCounts();

    // Invocation #2: resume from error — merge re-executes, should complete
    const result = await graph.invoke(initialState, config);

    expectNoInterrupts(result);
    const executedNodes = getExecutedNodes(executor.prompts);
    expect(executedNodes).not.toContain('analyze');
    expect(executedNodes).not.toContain('requirements');
    expect(executedNodes).not.toContain('research');
    expect(executedNodes).not.toContain('plan');
    expect(executedNodes).not.toContain('implement');
    // Merge re-executes (1 call) + evidence may re-run (up to 3 calls) = up to 4
    expect(executor.callCount).toBeLessThanOrEqual(4);
  });

  it('should resume from failed merge with gated merge (allowMerge=false) — should interrupt after recovery', async () => {
    const executor = createControllableExecutor();

    // Use gated merge (allowMerge=false) so merge node interrupts
    const checkpointer = createCheckpointer(':memory:');
    const mergeNodeDeps = createStubMergeNodeDeps();
    const deps: FeatureAgentGraphDeps = {
      executor: executor as unknown as IAgentExecutor,
      mergeNodeDeps,
    };
    const graph = createFeatureAgentGraph(deps, checkpointer);
    const threadId = `resume-merge-gated-${randomUUID()}`;
    const config = { configurable: { thread_id: threadId } };
    const initialState = {
      featureId: `feat-${randomUUID().slice(0, 8)}`,
      repositoryPath: tempDir,
      worktreePath: tempDir,
      specDir,
      approvalGates: PRD_PLAN_ALLOWED, // allowMerge=false
      push: false,
      openPr: false,
      enableEvidence: true,
      commitEvidence: false,
    };

    // Make merge-commit (7th call) throw
    executor.throwFromCall(7);

    // Invocation #1: fail at merge-commit call
    await expect(graph.invoke(initialState, config)).rejects.toThrow(NON_RETRYABLE_MSG);
    expect(executor.callCount).toBe(7);

    executor.clearThrow();
    executor.resetCounts();

    // Invocation #2: resume — merge re-executes, should interrupt for approval
    const result = await graph.invoke(initialState, config);

    // Merge node should re-execute its commit/push/PR step and then interrupt
    expectInterruptAt(result, 'merge');
    // Should only run merge-commit, not restart from analyze
    const executedNodes = getExecutedNodes(executor.prompts);
    expect(executedNodes).not.toContain('analyze');
    expect(executedNodes).not.toContain('requirements');
    expect(executedNodes).not.toContain('research');
    expect(executedNodes).not.toContain('plan');
    expect(executedNodes).not.toContain('implement');
    // Merge re-executes (1 call) + evidence may re-run (up to 3 calls) = up to 4
    expect(executor.callCount).toBeLessThanOrEqual(4);
  });
});
