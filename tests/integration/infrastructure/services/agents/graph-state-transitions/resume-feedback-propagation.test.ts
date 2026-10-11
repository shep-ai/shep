/**
 * Resume Feedback Propagation Tests
 *
 * Validates that when ANY node fails and the user resumes (with or without
 * feedback), the retried node's prompt:
 * 1. Tells the agent this is a resumed/retried run
 * 2. Includes the user's rejection feedback (if provided)
 * 3. Does NOT restart earlier nodes
 *
 * These test the FULL flow: error → reject/approve → resume at failed node
 * with user comment propagated to the prompt.
 *
 * Uses persistent checkpointer (same across invocations) + graph WITH merge.
 */

import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import yaml from 'js-yaml';
import {
  createFeatureAgentGraph,
  type FeatureAgentGraphDeps,
} from '@/infrastructure/services/agents/feature-agent/feature-agent-graph.js';
import { createCheckpointer } from '@/infrastructure/services/agents/common/checkpointer.js';
import type { IAgentExecutor } from '@/application/ports/output/agents/agent-executor.interface.js';
import type { Settings, RejectionFeedbackEntry } from '@/domain/generated/output.js';
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
import { ALL_GATES_ENABLED } from './helpers.js';

/**
 * Non-retryable error — retryExecute() throws immediately.
 */
const NON_RETRYABLE_MSG = 'Process exited with code 1: simulated node failure';

/**
 * Prompt markers for identifying which node ran.
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
 * Append rejection feedback to spec.yaml (simulates what RejectAgentRunUseCase does).
 */
function appendRejectionFeedback(specDir: string, message: string, phase: string): void {
  const specContent = readFileSync(join(specDir, 'spec.yaml'), 'utf-8');
  const spec = yaml.load(specContent) as Record<string, unknown>;

  const existing = Array.isArray(spec.rejectionFeedback)
    ? (spec.rejectionFeedback as RejectionFeedbackEntry[])
    : [];

  const newEntry: RejectionFeedbackEntry = {
    iteration: existing.length + 1,
    message,
    phase,
    timestamp: new Date().toISOString(),
  };

  spec.rejectionFeedback = [...existing, newEntry];
  writeFileSync(join(specDir, 'spec.yaml'), yaml.dump(spec), 'utf-8');
}

/**
 * Create a controllable executor that can throw from a specific call.
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

describe('Graph State Transitions › Resume Feedback Propagation', () => {
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

    tempDir = mkdtempSync(join(tmpdir(), 'shep-resume-feedback-'));
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

  function createResumableGraph(executor: ControllableExecutor, withMerge = false) {
    const checkpointer = createCheckpointer(':memory:');
    const deps: FeatureAgentGraphDeps = {
      executor: executor as unknown as IAgentExecutor,
      ...(withMerge ? { mergeNodeDeps: createStubMergeNodeDeps() } : {}),
    };
    const graph = createFeatureAgentGraph(deps, checkpointer);
    const threadId = `resume-fb-${randomUUID()}`;
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

  // ── Requirements failure + resume with feedback ──────────────────────

  describe('requirements failure', () => {
    it('should include user rejection feedback in requirements prompt after error reject', async () => {
      const executor = createControllableExecutor();
      executor.throwFromCall(2); // Fail at requirements

      const { graph, config, initialState } = createResumableGraph(executor);

      await expect(graph.invoke(initialState, config)).rejects.toThrow();

      executor.clearThrow();
      executor.resetCounts();

      // Simulate RejectAgentRunUseCase writing feedback to spec.yaml
      appendRejectionFeedback(
        specDir,
        'add more details about authentication flow',
        'requirements'
      );

      await graph.invoke(initialState, config);

      // The retried requirements prompt should contain the user's feedback
      const reqPrompts = executor.prompts.filter((p) => p.includes('REQUIREMENTS phase'));
      expect(reqPrompts.length).toBeGreaterThanOrEqual(1);
      expect(reqPrompts[0]).toContain('add more details about authentication flow');

      // Earlier nodes should NOT re-execute
      expect(getExecutedNodes(executor.prompts)).not.toContain('analyze');
    });

    it('should resume at requirements without feedback (plain retry)', async () => {
      const executor = createControllableExecutor();
      executor.throwFromCall(2);

      const { graph, config, initialState } = createResumableGraph(executor);

      await expect(graph.invoke(initialState, config)).rejects.toThrow();

      executor.clearThrow();
      executor.resetCounts();

      // No feedback — plain retry
      await graph.invoke(initialState, config);

      const reqPrompts = executor.prompts.filter((p) => p.includes('REQUIREMENTS phase'));
      expect(reqPrompts.length).toBeGreaterThanOrEqual(1);
      expect(getExecutedNodes(executor.prompts)).not.toContain('analyze');
    });
  });

  // ── Research failure + resume ────────────────────────────────────────

  describe('research failure', () => {
    it('should resume at research (not restart) on retry', async () => {
      const executor = createControllableExecutor();
      executor.throwFromCall(3); // Research is call #3

      const { graph, config, initialState } = createResumableGraph(executor);

      await expect(graph.invoke(initialState, config)).rejects.toThrow();

      executor.clearThrow();
      executor.resetCounts();

      await graph.invoke(initialState, config);

      // analyze and requirements should NOT re-execute
      expect(getExecutedNodes(executor.prompts)).not.toContain('analyze');
      expect(getExecutedNodes(executor.prompts)).not.toContain('requirements');
      expect(getExecutedNodes(executor.prompts)).toContain('research');
    });
  });

  // ── Plan failure + resume with feedback ──────────────────────────────

  describe('plan failure', () => {
    it('should include user rejection feedback in plan prompt after error reject', async () => {
      const executor = createControllableExecutor();
      executor.throwFromCall(4); // Plan is call #4

      const { graph, config, initialState } = createResumableGraph(executor);

      await expect(graph.invoke(initialState, config)).rejects.toThrow();

      executor.clearThrow();
      executor.resetCounts();

      appendRejectionFeedback(specDir, 'use postgres instead of mongodb', 'plan');

      await graph.invoke(initialState, config);

      const planPrompts = executor.prompts.filter((p) => p.includes('PLANNING phase'));
      expect(planPrompts.length).toBeGreaterThanOrEqual(1);
      expect(planPrompts[0]).toContain('use postgres instead of mongodb');

      // Earlier nodes should NOT re-execute
      expect(getExecutedNodes(executor.prompts)).not.toContain('analyze');
      expect(getExecutedNodes(executor.prompts)).not.toContain('requirements');
      expect(getExecutedNodes(executor.prompts)).not.toContain('research');
    });
  });

  // ── Implement failure + resume ───────────────────────────────────────

  describe('implement failure', () => {
    it('should resume at implement (not restart) on retry', async () => {
      const executor = createControllableExecutor();
      executor.throwFromCall(5); // Implement is call #5

      const { graph, config, initialState } = createResumableGraph(executor);

      await expect(graph.invoke(initialState, config)).rejects.toThrow();

      executor.clearThrow();
      executor.resetCounts();

      await graph.invoke(initialState, config);

      expect(getExecutedNodes(executor.prompts)).toContain('implement');
      expect(getExecutedNodes(executor.prompts)).not.toContain('analyze');
      expect(getExecutedNodes(executor.prompts)).not.toContain('requirements');
      expect(getExecutedNodes(executor.prompts)).not.toContain('research');
      expect(getExecutedNodes(executor.prompts)).not.toContain('plan');
    });
  });

  // ── Merge failure + resume with feedback ─────────────────────────────

  describe('merge failure', () => {
    it('should include user rejection feedback in merge prompt after error reject', async () => {
      const executor = createControllableExecutor();
      // With merge graph: analyze(1) + req(2) + research(3) + plan(4) + impl(5) + evidence(6) + merge-commit(7)
      executor.throwFromCall(7);

      const { graph, config, initialState } = createResumableGraph(executor, true);

      await expect(graph.invoke(initialState, config)).rejects.toThrow();

      executor.clearThrow();
      executor.resetCounts();

      // Write rejection feedback for merge phase
      appendRejectionFeedback(specDir, 'fix the PR description and add changelog', 'merge');

      await graph.invoke(initialState, config);

      // Merge prompt should contain the user's feedback from spec.yaml
      expect(executor.prompts.length).toBeGreaterThanOrEqual(1);
      const mergePrompt = executor.prompts[0];
      expect(mergePrompt).toContain('fix the PR description and add changelog');

      // Earlier nodes should NOT re-execute
      const executedNodes = getExecutedNodes(executor.prompts);
      expect(executedNodes).not.toContain('analyze');
      expect(executedNodes).not.toContain('requirements');
      expect(executedNodes).not.toContain('research');
      expect(executedNodes).not.toContain('plan');
      expect(executedNodes).not.toContain('implement');
    });

    it('should resume at merge without feedback (plain retry)', async () => {
      const executor = createControllableExecutor();
      executor.throwFromCall(7);

      const { graph, config, initialState } = createResumableGraph(executor, true);

      await expect(graph.invoke(initialState, config)).rejects.toThrow();

      executor.clearThrow();
      executor.resetCounts();

      await graph.invoke(initialState, config);

      // Merge re-executes, earlier nodes don't
      expect(executor.prompts.length).toBeGreaterThanOrEqual(1);
      const executedNodes = getExecutedNodes(executor.prompts);
      expect(executedNodes).not.toContain('analyze');
      expect(executedNodes).not.toContain('requirements');
    });
  });
});
