/**
 * HITL Approval Flow Integration Test
 *
 * Tests the full LangGraph interrupt/resume cycle for the feature agent
 * with human-in-the-loop approval gates.
 *
 * Uses a real SQLite checkpointer and mock agent executor (no LLM calls).
 * Verifies that:
 *   1. Graph pauses at the correct approval gates
 *   2. Resume continues from checkpoint (same thread_id)
 *   3. Wrong thread_id does NOT resume from checkpoint
 *   4. Different gate configurations change interrupt behavior
 */

import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Command } from '@langchain/langgraph';
import { createFeatureAgentGraph } from '@/infrastructure/services/agents/feature-agent/feature-agent-graph.js';
import { createCheckpointer } from '@/infrastructure/services/agents/common/checkpointer.js';
import type { IAgentExecutor } from '@/application/ports/output/agents/agent-executor.interface.js';
import {
  initializeSettings,
  hasSettings,
  resetSettings,
} from '@/infrastructure/services/settings.service.js';
import type { Settings } from '@/domain/generated/output.js';

function createMockExecutor(): IAgentExecutor {
  return {
    agentType: 'claude-code' as never,
    execute: vi.fn().mockResolvedValue({ result: 'Mock agent response for testing' }),
    executeStream: vi.fn(),
    supportsFeature: vi.fn().mockReturnValue(false),
  };
}

/** Extract the interrupt payload from a graph result. */
function getInterrupts(result: Record<string, unknown>): { value: Record<string, unknown> }[] {
  return (result.__interrupt__ as { value: Record<string, unknown> }[]) ?? [];
}

describe('HITL Approval Flow (Graph-level)', () => {
  let tempDir: string;
  let specDir: string;
  let stdoutSpy: ReturnType<typeof vi.spyOn>;
  let stderrSpy: ReturnType<typeof vi.spyOn>;

  beforeAll(() => {
    // Initialize settings with evidence enabled so implement node runs evidence sub-agent
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

    tempDir = mkdtempSync(join(tmpdir(), 'shep-hitl-test-'));
    specDir = join(tempDir, 'specs', '001-test');
    mkdirSync(specDir, { recursive: true });

    // spec.yaml must pass both validateSpecAnalyze and validateSpecRequirements
    writeFileSync(
      join(specDir, 'spec.yaml'),
      `${[
        'name: Test Feature',
        'number: 1',
        'branch: feat/test-feature',
        'oneLiner: A test feature for HITL e2e',
        'summary: This is a test feature used in integration tests',
        'phase: implementation',
        'sizeEstimate: S',
        'content: Full description of the test feature for HITL approval flow testing',
        'technologies:',
        '  - TypeScript',
        'openQuestions: []',
      ].join('\n')}\n`
    );
    // research.yaml must pass validateResearch
    writeFileSync(
      join(specDir, 'research.yaml'),
      `${[
        'name: Test Research',
        'summary: Research for test feature',
        'content: Detailed research content for the test feature',
        'decisions:',
        '  - title: Testing approach',
        '    chosen: Vitest',
        '    rejected:',
        '      - Jest',
        '    rationale: Vitest is faster and natively supports ESM',
      ].join('\n')}\n`
    );
    // plan.yaml must pass validatePlan (needs content, phases, filesToCreate/filesToModify)
    writeFileSync(
      join(specDir, 'plan.yaml'),
      `${[
        'content: Implementation plan for test feature',
        'phases:',
        '  - id: phase-1',
        '    name: Setup',
        '    parallel: false',
        '    taskIds:',
        '      - task-1',
        'filesToCreate:',
        '  - src/test-feature.ts',
      ].join('\n')}\n`
    );
    writeFileSync(
      join(specDir, 'tasks.yaml'),
      `${[
        'tasks:',
        '  - id: task-1',
        '    phaseId: phase-1',
        '    title: Implement feature',
        '    description: Implement the test feature',
        '    state: todo',
        '    dependencies: []',
        '    acceptanceCriteria:',
        '      - Feature works',
        '    tdd: null',
        '    estimatedEffort: small',
      ].join('\n')}\n`
    );

    // Suppress node logger output during tests
    stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
  });

  beforeEach(() => {
    // Reset feature.yaml so markPhaseComplete from previous tests doesn't affect next test
    writeFileSync(join(specDir, 'feature.yaml'), 'status:\n  completedPhases: []\n');
  });

  afterAll(() => {
    stdoutSpy.mockRestore();
    stderrSpy.mockRestore();
    rmSync(tempDir, { recursive: true, force: true });
    resetSettings();
  });

  it('should pause at requirements, plan, and implement gates then complete on final resume', async () => {
    const executor = createMockExecutor();
    const checkpointer = createCheckpointer(':memory:');
    const graph = createFeatureAgentGraph(executor, checkpointer);
    const config = { configurable: { thread_id: 'full-cycle-thread' } };

    const initialState = {
      featureId: 'feat-test-001',
      repositoryPath: tempDir,
      worktreePath: tempDir,
      specDir,
      approvalGates: { allowPrd: false, allowPlan: false, allowMerge: false },
      enableEvidence: true,
      commitEvidence: false,
    };

    // Step 1: Initial invoke → analyze runs, then requirements interrupts
    const result1 = await graph.invoke(initialState, config);
    const interrupts1 = getInterrupts(result1);
    expect(interrupts1.length).toBe(1);
    expect(interrupts1[0].value.node).toBe('requirements');

    // analyze + requirements = 2 executor calls so far
    expect(executor.execute).toHaveBeenCalledTimes(2);

    // Step 2: Resume → requirements skips (already complete), research runs, plan interrupts
    const result2 = await graph.invoke(new Command({ resume: { approved: true } }), config);
    const interrupts2 = getInterrupts(result2);
    expect(interrupts2.length).toBe(1);
    expect(interrupts2[0].value.node).toBe('plan');

    // research + plan = 2 more calls (requirements NOT re-executed)
    expect(executor.execute).toHaveBeenCalledTimes(4);

    // Step 3: Resume → plan skips (already complete), implement runs to completion (no interrupt)
    const result3 = await graph.invoke(new Command({ resume: { approved: true } }), config);
    const interrupts3 = getInterrupts(result3);
    expect(interrupts3).toHaveLength(0);

    // implement + 3 evidence attempts = 4 more calls (plan NOT re-executed), graph reaches END
    expect(executor.execute).toHaveBeenCalledTimes(8);

    // All nodes ran — verify messages accumulated
    expect(result3.messages.length).toBeGreaterThanOrEqual(1);
  });

  it('should resume from checkpoint with correct thread_id (regression: threadId bug)', async () => {
    const executor = createMockExecutor();
    const checkpointer = createCheckpointer(':memory:');
    const graph = createFeatureAgentGraph(executor, checkpointer);
    const threadId = 'correct-thread';
    const config = { configurable: { thread_id: threadId } };

    // Initial invoke → interrupt at requirements
    const result1 = await graph.invoke(
      {
        featureId: 'feat-test-002',
        repositoryPath: tempDir,
        worktreePath: tempDir,
        specDir,
        approvalGates: { allowPrd: false, allowPlan: false, allowMerge: false },
      },
      config
    );
    expect(getInterrupts(result1)[0].value.node).toBe('requirements');

    // Resume with same threadId → should continue past requirements to plan
    const result2 = await graph.invoke(new Command({ resume: { approved: true } }), config);
    const interrupts = getInterrupts(result2);
    expect(interrupts.length).toBe(1);
    expect(interrupts[0].value.node).toBe('plan');
  });

  it('should NOT resume from checkpoint with wrong thread_id (demonstrates the bug)', async () => {
    const executor = createMockExecutor();
    const checkpointer = createCheckpointer(':memory:');
    const graph = createFeatureAgentGraph(executor, checkpointer);

    // Initial invoke with thread A → interrupt at requirements
    const result1 = await graph.invoke(
      {
        featureId: 'feat-test-003',
        repositoryPath: tempDir,
        worktreePath: tempDir,
        specDir,
        approvalGates: { allowPrd: false, allowPlan: false, allowMerge: false },
      },
      { configurable: { thread_id: 'thread-A' } }
    );
    expect(getInterrupts(result1)[0].value.node).toBe('requirements');

    // Resume with WRONG thread_id — no checkpoint exists.
    // LangGraph silently returns empty state instead of continuing the graph.
    // This is exactly what caused the "instant completion" bug:
    // the worker saw no error + no interrupt → marked run as "completed".
    const result2 = await graph.invoke(new Command({ resume: { approved: true } }), {
      configurable: { thread_id: 'thread-B' },
    });

    // With wrong thread: no nodes executed, no messages, no interrupts
    expect(result2.messages ?? []).toHaveLength(0);
    expect(getInterrupts(result2)).toHaveLength(0);

    // Contrast: correct thread resumes properly
    const result3 = await graph.invoke(new Command({ resume: { approved: true } }), {
      configurable: { thread_id: 'thread-A' },
    });
    // Should continue to plan interrupt (not empty/completed)
    expect(getInterrupts(result3).length).toBe(1);
    expect(getInterrupts(result3)[0].value.node).toBe('plan');
  });

  it('should not interrupt when approvalGates is undefined (fully autonomous)', async () => {
    const executor = createMockExecutor();
    const checkpointer = createCheckpointer(':memory:');
    const graph = createFeatureAgentGraph(executor, checkpointer);
    const config = { configurable: { thread_id: 'autonomous-thread' } };

    // No approval gates → fully autonomous, graph runs to completion
    const result = await graph.invoke(
      {
        featureId: 'feat-test-004',
        repositoryPath: tempDir,
        worktreePath: tempDir,
        specDir,
      },
      config
    );

    expect(getInterrupts(result)).toHaveLength(0);
    expect(result.messages.length).toBeGreaterThanOrEqual(1);
  });

  it('should skip requirements gate when allowPrd=true, interrupt at plan', async () => {
    const executor = createMockExecutor();
    const checkpointer = createCheckpointer(':memory:');
    const graph = createFeatureAgentGraph(executor, checkpointer);
    const config = { configurable: { thread_id: 'skip-prd-thread' } };

    const result = await graph.invoke(
      {
        featureId: 'feat-test-005',
        repositoryPath: tempDir,
        worktreePath: tempDir,
        specDir,
        approvalGates: { allowPrd: true, allowPlan: false, allowMerge: false },
      },
      config
    );

    // Should skip requirements interrupt and pause at plan instead
    const interrupts = getInterrupts(result);
    expect(interrupts.length).toBe(1);
    expect(interrupts[0].value.node).toBe('plan');
  });

  it('should skip requirements and plan gates when both allowed, complete without implement interrupt', async () => {
    const executor = createMockExecutor();
    const checkpointer = createCheckpointer(':memory:');
    const graph = createFeatureAgentGraph(executor, checkpointer);
    const config = { configurable: { thread_id: 'skip-both-thread' } };

    const result = await graph.invoke(
      {
        featureId: 'feat-test-006',
        repositoryPath: tempDir,
        worktreePath: tempDir,
        specDir,
        approvalGates: { allowPrd: true, allowPlan: true, allowMerge: false },
      },
      config
    );

    // allowPrd + allowPlan skips requirements/plan gates, implement does not interrupt
    const interrupts = getInterrupts(result);
    expect(interrupts).toHaveLength(0);
  });

  it('should trigger repair when spec.yaml is invalid, then continue after fix', async () => {
    const executor = createMockExecutor();
    const checkpointer = createCheckpointer(':memory:');
    const graph = createFeatureAgentGraph(executor, checkpointer);
    const config = { configurable: { thread_id: 'repair-loop-thread' } };

    // Write INVALID spec.yaml (missing most required fields)
    writeFileSync(join(specDir, 'spec.yaml'), 'name: Broken Spec\n');

    // Mock executor: on the REPAIR call, write valid spec.yaml
    let callCount = 0;
    (executor.execute as ReturnType<typeof vi.fn>).mockImplementation(async () => {
      callCount++;
      // The repair node is the 2nd executor call (after analyze)
      if (callCount === 2) {
        // Repair call: write a valid spec.yaml
        writeFileSync(
          join(specDir, 'spec.yaml'),
          `${[
            'name: Fixed Spec',
            'number: 1',
            'branch: feat/test-feature',
            'oneLiner: A repaired spec',
            'summary: This spec was repaired by the repair node',
            'phase: implementation',
            'sizeEstimate: S',
            'content: Full content of the repaired spec',
            'technologies:',
            '  - TypeScript',
            'openQuestions: []',
          ].join('\n')}\n`
        );
      }
      return { result: 'Mock agent response' };
    });

    const result = await graph.invoke(
      {
        featureId: 'feat-test-repair',
        repositoryPath: tempDir,
        worktreePath: tempDir,
        specDir,
        approvalGates: { allowPrd: false, allowPlan: false, allowMerge: false },
      },
      config
    );

    // Verify repair ran (at least analyze + repair = 2 calls)
    expect(callCount).toBeGreaterThanOrEqual(2);

    // Graph should have continued past validation to requirements interrupt
    const interrupts = getInterrupts(result);
    expect(interrupts.length).toBe(1);
    expect(interrupts[0].value.node).toBe('requirements');

    // Verify repair message is in the accumulated messages
    expect(result.messages.some((m: string) => m.includes('repair'))).toBe(true);

    // Restore valid spec.yaml for subsequent tests
    writeFileSync(
      join(specDir, 'spec.yaml'),
      `${[
        'name: Test Feature',
        'number: 1',
        'branch: feat/test-feature',
        'oneLiner: A test feature for HITL e2e',
        'summary: This is a test feature used in integration tests',
        'phase: implementation',
        'sizeEstimate: S',
        'content: Full description of the test feature for HITL approval flow testing',
        'technologies:',
        '  - TypeScript',
        'openQuestions: []',
      ].join('\n')}\n`
    );
  });
});
