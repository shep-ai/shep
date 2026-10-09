/**
 * Resume After Error Tests
 *
 * Tests that when a node throws an error, resuming the graph with the same
 * thread_id continues from the LAST SUCCESSFUL node — not from the beginning.
 *
 * This is the critical path for `shep feat resume` after a failed run.
 *
 * Mechanism:
 * - Nodes mark completedPhases in feature.yaml on success
 * - On resume, executeNode() checks completedPhases and skips completed nodes
 * - LangGraph checkpointer provides the state from the last successful checkpoint
 * - Together, these ensure only the failed node (and downstream) re-execute
 *
 * Key difference from other tests: we reuse the SAME checkpointer instance
 * across invocations to simulate the real resume flow.
 */

import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import {
  createFeatureAgentGraph,
  type FeatureAgentGraphDeps,
} from '@/infrastructure/services/agents/feature-agent/feature-agent-graph.js';
import { createCheckpointer } from '@/infrastructure/services/agents/common/checkpointer.js';
import type { IAgentExecutor } from '@/application/ports/output/agents/agent-executor.interface.js';
import {
  VALID_SPEC_YAML,
  VALID_RESEARCH_YAML,
  VALID_PLAN_YAML,
  VALID_TASKS_YAML,
} from './fixtures.js';
import { expectNoInterrupts, ALL_GATES_ENABLED } from './helpers.js';
import {
  initializeSettings,
  hasSettings,
  resetSettings,
} from '@/infrastructure/services/settings.service.js';
import type { Settings } from '@/domain/generated/output.js';

/**
 * Non-retryable error message. retryExecute() checks for "Process exited with code"
 * and throws immediately without retry. This ensures the node fails on first attempt.
 */
const NON_RETRYABLE_MSG = 'Process exited with code 1: simulated failure';

/**
 * Identify which producer nodes ran by inspecting executor.prompts.
 * Each node's prompt builder includes a unique phase identifier.
 * Since executor.prompts is reset between invocations (via resetCounts),
 * this reliably shows which nodes ran in the CURRENT invocation only —
 * unlike result.messages which accumulates across checkpointer state.
 */
const PROMPT_NODE_MARKERS: [string, string][] = [
  ['analyze', 'ANALYSIS phase'],
  ['requirements', 'REQUIREMENTS phase'],
  ['research', 'RESEARCH phase'],
  ['plan', 'PLANNING phase'],
  ['implement', 'autonomous implementation'],
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
 * Create a controllable executor that can be configured to throw starting
 * from a specific call count, simulating node failures.
 *
 * Uses a non-retryable error so retryExecute() doesn't absorb the failure.
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
    /** Configure executor to throw starting from the Nth call (1-based). All calls >= N throw. */
    throwFromCall(n: number) {
      throwFromCall = n;
    },
    /** Clear the throw trigger so all future calls succeed. */
    clearThrow() {
      throwFromCall = null;
    },
    /** Reset call count and prompts (but NOT the throw config). */
    resetCounts() {
      callCount = 0;
      prompts.length = 0;
      executeFn.mockClear();
    },
  };
}

type ControllableExecutor = ReturnType<typeof createControllableExecutor>;

describe('Graph State Transitions › Resume After Error', () => {
  let tempDir: string;
  let specDir: string;
  let output: { restore: () => void };

  beforeAll(() => {
    // Initialize settings singleton so evidence sub-agent runs within implement node
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

    tempDir = mkdtempSync(join(tmpdir(), 'shep-resume-err-'));
    specDir = join(tempDir, 'specs', '001-test');
    mkdirSync(specDir, { recursive: true });
  });

  beforeEach(() => {
    // Write fresh fixture files
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
   * Helper: create a graph + checkpointer pair that persists across invocations.
   * The SAME checkpointer is reused — this is the critical difference from other tests.
   */
  function createResumableGraph(executor: ControllableExecutor) {
    const checkpointer = createCheckpointer(':memory:');
    const deps: FeatureAgentGraphDeps = { executor: executor as unknown as IAgentExecutor };
    const graph = createFeatureAgentGraph(deps, checkpointer);
    const threadId = `resume-test-${randomUUID()}`;
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

    return { graph, config, initialState };
  }

  it('should resume from failed implement — not restart from analyze', async () => {
    const executor = createControllableExecutor();

    // Graph producer nodes call executor: analyze(1), requirements(2), research(3), plan(4), implement(5)
    // Make implement (5th executor call) throw
    executor.throwFromCall(5);

    const { graph, config, initialState } = createResumableGraph(executor);

    // Invocation #1: should fail at implement
    await expect(graph.invoke(initialState, config)).rejects.toThrow();
    expect(executor.callCount).toBe(5); // analyze + req + research + plan + implement(threw)

    // Clear the throw and reset counts for tracking
    executor.clearThrow();
    executor.resetCounts();

    // Capture baseline message count before resume
    // Invocation #2: resume with same config (same thread_id + checkpointer)
    // Should NOT re-execute analyze, requirements, research, plan
    // Should ONLY re-execute implement (+ 3 evidence retry attempts after)
    const result = await graph.invoke(initialState, config);

    expectNoInterrupts(result);
    expect(executor.callCount).toBe(4);
    expect(getExecutedNodes(executor.prompts)).toEqual(['implement']);
  });

  it('should resume from failed research — skipping analyze and requirements', async () => {
    const executor = createControllableExecutor();

    // Make research (3rd executor call) throw
    executor.throwFromCall(3);

    const { graph, config, initialState } = createResumableGraph(executor);

    // Invocation #1: should fail at research
    await expect(graph.invoke(initialState, config)).rejects.toThrow();
    expect(executor.callCount).toBe(3); // analyze + req + research(threw)

    executor.clearThrow();
    executor.resetCounts();

    // Invocation #2: should skip analyze + requirements, re-run research + plan + implement + 3 evidence attempts
    const result = await graph.invoke(initialState, config);

    expectNoInterrupts(result);
    expect(executor.callCount).toBe(6);
    expect(getExecutedNodes(executor.prompts)).toEqual(['research', 'plan', 'implement']);
  });

  it('should resume from failed analyze — re-execute entire graph', async () => {
    const executor = createControllableExecutor();

    // Make analyze (1st executor call) throw
    executor.throwFromCall(1);

    const { graph, config, initialState } = createResumableGraph(executor);

    // Invocation #1: should fail at analyze
    await expect(graph.invoke(initialState, config)).rejects.toThrow();
    expect(executor.callCount).toBe(1);

    executor.clearThrow();
    executor.resetCounts();

    // Invocation #2: nothing was completed, so all nodes run (including 3 evidence attempts)
    const result = await graph.invoke(initialState, config);

    expectNoInterrupts(result);
    expect(executor.callCount).toBe(8);
    expect(getExecutedNodes(executor.prompts)).toEqual([
      'analyze',
      'requirements',
      'research',
      'plan',
      'implement',
    ]);
  });

  it('should resume from failed plan — skipping analyze, requirements, research', async () => {
    const executor = createControllableExecutor();

    // Make plan (4th executor call) throw
    executor.throwFromCall(4);

    const { graph, config, initialState } = createResumableGraph(executor);

    // Invocation #1: should fail at plan
    await expect(graph.invoke(initialState, config)).rejects.toThrow();
    expect(executor.callCount).toBe(4);

    executor.clearThrow();
    executor.resetCounts();

    // Invocation #2: skip analyze + req + research, re-run plan + implement + 3 evidence attempts
    const result = await graph.invoke(initialState, config);

    expectNoInterrupts(result);
    expect(executor.callCount).toBe(5);
    expect(getExecutedNodes(executor.prompts)).toEqual(['plan', 'implement']);
  });

  it('should handle multiple resume attempts — fail, resume-fail-again, resume-succeed', async () => {
    const executor = createControllableExecutor();

    // Fail at implement (5th call)
    executor.throwFromCall(5);

    const { graph, config, initialState } = createResumableGraph(executor);

    // Invocation #1: fail at implement
    await expect(graph.invoke(initialState, config)).rejects.toThrow();
    expect(executor.callCount).toBe(5);

    // Invocation #2: fail at implement AGAIN (1st call in this batch = implement retry)
    executor.resetCounts();
    executor.throwFromCall(1); // 1st call in resumed graph = implement retry

    await expect(graph.invoke(initialState, config)).rejects.toThrow();
    expect(executor.callCount).toBe(1); // Only implement was attempted

    // Invocation #3: finally succeed (implement + 3 evidence attempts)
    executor.clearThrow();
    executor.resetCounts();

    const result = await graph.invoke(initialState, config);

    expectNoInterrupts(result);
    expect(executor.callCount).toBe(4);
    expect(getExecutedNodes(executor.prompts)).toEqual(['implement']);
  });
});
