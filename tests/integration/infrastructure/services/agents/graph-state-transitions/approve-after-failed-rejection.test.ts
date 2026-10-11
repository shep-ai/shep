/**
 * Approve After Failed Rejection Tests
 *
 * Scenario: Node interrupts → user rejects → re-execution FAILS (throws) →
 * user approves → node should re-execute and CONTINUE without interrupting again.
 *
 * The user already gave approval — they should not be asked twice.
 *
 * Covers requirements, plan, and merge nodes.
 */

import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { Command } from '@langchain/langgraph';
import { createFeatureAgentGraph } from '@/infrastructure/services/agents/feature-agent/feature-agent-graph.js';
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
  rejectCommand,
  ALL_GATES_DISABLED,
  PRD_PLAN_ALLOWED,
} from './helpers.js';

const NON_RETRYABLE_MSG = 'Process exited with code 1: simulated failure during re-execution';

/**
 * Controllable executor that can throw on specific calls.
 * Tracks call count across invocations (NOT reset between graph.invoke calls)
 * unless explicitly reset.
 */
function createControllableExecutor() {
  let callCount = 0;
  const prompts: string[] = [];
  let throwOnCall: number | null = null;

  const executeFn = vi.fn(async (prompt: string) => {
    callCount++;
    prompts.push(prompt);
    if (throwOnCall !== null && callCount === throwOnCall) {
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
    /** Make the Nth call (1-based, cumulative) throw. Only that exact call throws. */
    throwOnCall(n: number) {
      throwOnCall = n;
    },
    clearThrow() {
      throwOnCall = null;
    },
    resetCounts() {
      callCount = 0;
      prompts.length = 0;
      executeFn.mockClear();
    },
  };
}

describe('Graph State Transitions › Approve After Failed Rejection', () => {
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

    tempDir = mkdtempSync(join(tmpdir(), 'shep-approve-failed-'));
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

  it('requirements: reject → fail during re-exec → approve → should continue to plan without re-interrupting', async () => {
    const executor = createControllableExecutor();
    const checkpointer = createCheckpointer(':memory:');
    const graph = createFeatureAgentGraph(
      { executor: executor as unknown as IAgentExecutor },
      checkpointer
    );
    const config = { configurable: { thread_id: `approve-failed-req-${randomUUID()}` } };
    const state = {
      featureId: `feat-${randomUUID().slice(0, 8)}`,
      repositoryPath: tempDir,
      worktreePath: tempDir,
      specDir,
      approvalGates: ALL_GATES_DISABLED,
      push: false,
      openPr: false,
    };

    // Step 1: invoke → runs analyze(1) + req(2) → interrupts at requirements
    const r1 = await graph.invoke(state, config);
    expectInterruptAt(r1, 'requirements');
    expect(executor.callCount).toBe(2); // analyze + requirements

    // Step 2: reject → re-execution of requirements, but make it FAIL
    // The rejection triggers routeReexecution back to requirements.
    // On re-entry, requirements will re-execute. That's call #3.
    executor.throwOnCall(3);

    await expect(graph.invoke(rejectCommand('add auth details'), config)).rejects.toThrow(
      NON_RETRYABLE_MSG
    );

    // Step 3: approve after failure — should re-execute requirements and CONTINUE
    // without interrupting again (user already approved)
    executor.clearThrow();

    const r3 = await graph.invoke(
      new Command({
        resume: { approved: true },
        update: { _approvalAction: 'approved', _rejectionFeedback: null },
      }),
      config
    );

    // Should NOT interrupt at requirements again — user already approved
    // Should continue to plan and interrupt there (plan is also gated)
    expectInterruptAt(r3, 'plan');
  });

  it('plan: reject → fail during re-exec → approve → should continue to implement without re-interrupting', async () => {
    const executor = createControllableExecutor();
    const checkpointer = createCheckpointer(':memory:');
    const graph = createFeatureAgentGraph(
      { executor: executor as unknown as IAgentExecutor },
      checkpointer
    );
    const config = { configurable: { thread_id: `approve-failed-plan-${randomUUID()}` } };
    const state = {
      featureId: `feat-${randomUUID().slice(0, 8)}`,
      repositoryPath: tempDir,
      worktreePath: tempDir,
      specDir,
      approvalGates: { allowPrd: true, allowPlan: false, allowMerge: true },
      push: false,
      openPr: false,
    };

    // Step 1: invoke → runs through to plan → interrupts
    const r1 = await graph.invoke(state, config);
    expectInterruptAt(r1, 'plan');

    // Step 2: reject plan → re-execution fails
    // plan re-exec will be the next executor call after the initial ones
    const planCallNumber = executor.callCount + 1;
    executor.throwOnCall(planCallNumber);

    await expect(graph.invoke(rejectCommand('use different architecture'), config)).rejects.toThrow(
      NON_RETRYABLE_MSG
    );

    // Step 3: approve after failure → should re-execute plan and continue to implement
    executor.clearThrow();

    const r3 = await graph.invoke(
      new Command({
        resume: { approved: true },
        update: { _approvalAction: 'approved', _rejectionFeedback: null },
      }),
      config
    );

    // Should NOT interrupt at plan again — should continue to implement and complete
    expectNoInterrupts(r3);
  });

  it('merge: reject → fail during re-exec → approve → should complete without re-interrupting', async () => {
    const executor = createControllableExecutor();
    const checkpointer = createCheckpointer(':memory:');
    const mergeNodeDeps = createStubMergeNodeDeps();
    const graph = createFeatureAgentGraph(
      { executor: executor as unknown as IAgentExecutor, mergeNodeDeps },
      checkpointer
    );
    const config = { configurable: { thread_id: `approve-failed-merge-${randomUUID()}` } };
    const state = {
      featureId: `feat-${randomUUID().slice(0, 8)}`,
      repositoryPath: tempDir,
      worktreePath: tempDir,
      specDir,
      approvalGates: PRD_PLAN_ALLOWED, // only merge gated
      push: false,
      openPr: false,
    };

    // Step 1: invoke → runs all nodes → interrupts at merge
    const r1 = await graph.invoke(state, config);
    expectInterruptAt(r1, 'merge');

    // Step 2: reject merge → re-execution fails
    const mergeCallNumber = executor.callCount + 1;
    executor.throwOnCall(mergeCallNumber);

    await expect(graph.invoke(rejectCommand('fix PR description'), config)).rejects.toThrow(
      NON_RETRYABLE_MSG
    );

    // Step 3: approve after failure → should re-execute merge and complete
    executor.clearThrow();

    const r3 = await graph.invoke(
      new Command({
        resume: { approved: true },
        update: { _approvalAction: 'approved', _rejectionFeedback: null },
      }),
      config
    );

    // Should NOT interrupt at merge again — should complete
    expectNoInterrupts(r3);
  });
});
