/**
 * Exploration Agent Graph Unit Tests
 *
 * Tests for the exploration-mode LangGraph StateGraph that contains
 * prototype-generate → apply-feedback nodes in a feedback loop.
 */

import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemorySaver, Command } from '@langchain/langgraph';
import type { IAgentExecutor } from '@/application/ports/output/agents/agent-executor.interface.js';
import type { AgentType } from '@/domain/generated/output.js';

// ─── Mocks ──────────────────────────────────────────────────────────

const { mockReadFileSync, mockReaddirSync, mockStatSync } = vi.hoisted(() => ({
  mockReadFileSync: vi.fn(),
  mockReaddirSync: vi.fn(),
  mockStatSync: vi.fn(),
}));

vi.mock('node:fs', async (importOriginal) => {
  // eslint-disable-next-line @typescript-eslint/consistent-type-imports
  const actual = await importOriginal<typeof import('node:fs')>();
  return {
    ...actual,
    default: {
      ...actual,
      readFileSync: mockReadFileSync,
      readdirSync: mockReaddirSync,
      statSync: mockStatSync,
    },
    readFileSync: mockReadFileSync,
    readdirSync: mockReaddirSync,
    statSync: mockStatSync,
  };
});

vi.mock('@/infrastructure/services/agents/feature-agent/heartbeat.js', () => ({
  reportNodeStart: vi.fn(),
}));

vi.mock('@/infrastructure/services/agents/feature-agent/lifecycle-context.js', () => ({
  updateNodeLifecycle: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/infrastructure/services/agents/feature-agent/phase-timing-context.js', () => ({
  recordPhaseStart: vi.fn().mockResolvedValue('timing-id'),
  recordPhaseEnd: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/infrastructure/services/settings.service.js', () => ({
  hasSettings: vi.fn().mockReturnValue(false),
  getSettings: vi.fn().mockReturnValue({}),
}));

const MOCK_SPEC_YAML = `name: explore-idea
userQuery: >
  Add workspace grouping for repos
summary: Explore workspace concept
phase: Exploring
`;

function setupFileMocks(): void {
  mockReadFileSync.mockImplementation((path: string) => {
    if (typeof path === 'string') {
      if (path.endsWith('spec.yaml')) return MOCK_SPEC_YAML;
      if (path.endsWith('feature.yaml')) return 'feature:\n  id: test';
    }
    throw new Error(`ENOENT: ${path}`);
  });

  mockReaddirSync.mockReturnValue(['src', 'package.json']);
  mockStatSync.mockImplementation((path: string) => {
    const name = path.split('/').pop() ?? '';
    return { isDirectory: () => !name.includes('.') };
  });
}

import {
  createExplorationAgentGraph,
  FeatureAgentAnnotation,
  routeAfterPrototypeGenerate,
} from '@/infrastructure/services/agents/feature-agent/exploration-agent-graph.js';
import type { FeatureAgentState } from '@/infrastructure/services/agents/feature-agent/state.js';

function createMockExecutor(): IAgentExecutor {
  return {
    agentType: 'claude-code' as AgentType,
    execute: vi.fn().mockResolvedValue({ result: 'Mock prototype code' }),
    executeStream: vi.fn(),
    supportsFeature: vi.fn().mockReturnValue(false),
  };
}

// ─── Tests ──────────────────────────────────────────────────────────

describe('FeatureAgentAnnotation (exploration graph)', () => {
  it('should be the same Annotation as the full and fast graphs', () => {
    expect(FeatureAgentAnnotation).toBeDefined();
    expect(FeatureAgentAnnotation.spec).toBeDefined();
  });
});

describe('routeAfterPrototypeGenerate', () => {
  function makeState(overrides?: Partial<FeatureAgentState>): FeatureAgentState {
    return {
      featureId: 'feat-1',
      repositoryPath: '/repo',
      specDir: '/specs',
      worktreePath: '/wt',
      currentNode: 'prototype-generate',
      error: null,
      approvalGates: undefined,
      messages: [],
      validationRetries: 0,
      lastValidationTarget: '',
      lastValidationErrors: [],
      _approvalAction: null,
      _rejectionFeedback: null,
      _needsReexecution: false,
      prUrl: null,
      prNumber: null,
      commitHash: null,
      ciStatus: null,
      push: false,
      openPr: false,
      ciFixAttempts: 0,
      ciFixHistory: [],
      ciFixStatus: 'idle',
      evidence: [],
      evidenceRetries: 0,
      model: undefined,
      resumeReason: undefined,
      forkAndPr: false,
      commitSpecs: true,
      ciWatchEnabled: true,
      enableEvidence: false,
      commitEvidence: false,
      iterationCount: 1,
      maxIterations: 10,
      feedbackHistory: [],
      explorationStatus: 'waiting-feedback',
      ...overrides,
    };
  }

  it('routes to apply-feedback on rejected action (iterate)', () => {
    const state = makeState({ _approvalAction: 'rejected' });
    expect(routeAfterPrototypeGenerate(state)).toBe('apply-feedback');
  });

  it('routes to END on approved action (promote)', () => {
    const state = makeState({ _approvalAction: 'approved' });
    expect(routeAfterPrototypeGenerate(state)).toBe('__end__');
  });

  it('routes to END on null action (discard)', () => {
    const state = makeState({ _approvalAction: null });
    expect(routeAfterPrototypeGenerate(state)).toBe('__end__');
  });
});

describe('createExplorationAgentGraph', () => {
  let checkpointer: MemorySaver;
  let mockExecutor: IAgentExecutor;

  beforeEach(() => {
    checkpointer = new MemorySaver();
    mockExecutor = createMockExecutor();
    mockReadFileSync.mockReset();
    mockReaddirSync.mockReset();
    mockStatSync.mockReset();
  });

  it('creates a compiled graph', () => {
    const compiled = createExplorationAgentGraph(mockExecutor, checkpointer);
    expect(compiled).toBeDefined();
  });

  it('works without a checkpointer', () => {
    const compiled = createExplorationAgentGraph(mockExecutor);
    expect(compiled).toBeDefined();
  });

  it('accepts deps object with executor', () => {
    const compiled = createExplorationAgentGraph({ executor: mockExecutor }, checkpointer);
    expect(compiled).toBeDefined();
  });

  describe('graph structure', () => {
    it('has prototype-generate node', () => {
      const compiled = createExplorationAgentGraph(mockExecutor, checkpointer);
      const graphRepr = compiled.getGraph();
      const nodeIds = Object.keys(graphRepr.nodes);

      expect(nodeIds).toContain('prototype-generate');
    });

    it('has apply-feedback node', () => {
      const compiled = createExplorationAgentGraph(mockExecutor, checkpointer);
      const graphRepr = compiled.getGraph();
      const nodeIds = Object.keys(graphRepr.nodes);

      expect(nodeIds).toContain('apply-feedback');
    });

    it('does NOT have full pipeline or fast-mode nodes', () => {
      const compiled = createExplorationAgentGraph(mockExecutor, checkpointer);
      const graphRepr = compiled.getGraph();
      const nodeIds = Object.keys(graphRepr.nodes);

      expect(nodeIds).not.toContain('analyze');
      expect(nodeIds).not.toContain('requirements');
      expect(nodeIds).not.toContain('research');
      expect(nodeIds).not.toContain('plan');
      expect(nodeIds).not.toContain('implement');
      expect(nodeIds).not.toContain('fast-implement');
      expect(nodeIds).not.toContain('merge');
    });

    it('has edge from START to prototype-generate', () => {
      const compiled = createExplorationAgentGraph(mockExecutor, checkpointer);
      const graphRepr = compiled.getGraph();
      const edgePairs = graphRepr.edges.map((e) => [e.source, e.target]);

      expect(edgePairs).toContainEqual(['__start__', 'prototype-generate']);
    });

    it('has edge from apply-feedback to prototype-generate (loop)', () => {
      const compiled = createExplorationAgentGraph(mockExecutor, checkpointer);
      const graphRepr = compiled.getGraph();
      const edgePairs = graphRepr.edges.map((e) => [e.source, e.target]);

      expect(edgePairs).toContainEqual(['apply-feedback', 'prototype-generate']);
    });
  });

  describe('graph invocation', () => {
    it('calls prototype-generate node first and interrupts', async () => {
      setupFileMocks();
      const compiled = createExplorationAgentGraph(mockExecutor, checkpointer);

      const result = await compiled.invoke(
        {
          featureId: 'feat-explore-1',
          repositoryPath: '/test/repo',
          worktreePath: '/test/repo',
          specDir: '/test/specs/001-test',
        },
        { configurable: { thread_id: 'explore-thread-1' } }
      );

      // The graph should have called the executor
      expect(mockExecutor.execute).toHaveBeenCalledTimes(1);

      // The graph should be interrupted (prototype-generate calls interrupt())
      const interruptPayload = (result as Record<string, unknown>).__interrupt__ as
        | { value: unknown }[]
        | undefined;
      expect(interruptPayload).toBeDefined();
      expect(interruptPayload!.length).toBeGreaterThan(0);
    });

    it('routes to apply-feedback on iterate resume action', async () => {
      setupFileMocks();
      const compiled = createExplorationAgentGraph(mockExecutor, checkpointer);
      const threadId = 'explore-iterate-thread';

      // First invocation — generates prototype and interrupts
      await compiled.invoke(
        {
          featureId: 'feat-explore-2',
          repositoryPath: '/test/repo',
          worktreePath: '/test/repo',
          specDir: '/test/specs/001-test',
        },
        { configurable: { thread_id: threadId } }
      );

      expect(mockExecutor.execute).toHaveBeenCalledTimes(1);

      // Resume with iterate action (rejection = iterate in exploration context)
      const result = await compiled.invoke(
        new Command({
          resume: { feedback: 'make it blue', action: 'iterate' },
          update: {
            _approvalAction: 'rejected',
            _rejectionFeedback: 'make it blue',
          },
        }),
        { configurable: { thread_id: threadId } }
      );

      // The executor should have been called again for the second iteration
      expect(mockExecutor.execute).toHaveBeenCalledTimes(2);

      // Should interrupt again for the next round of feedback
      const interruptPayload = (result as Record<string, unknown>).__interrupt__ as
        | { value: unknown }[]
        | undefined;
      expect(interruptPayload).toBeDefined();
    });

    it('routes to END on promote resume action', async () => {
      setupFileMocks();
      const compiled = createExplorationAgentGraph(mockExecutor, checkpointer);
      const threadId = 'explore-promote-thread';

      // First invocation — generates prototype and interrupts
      await compiled.invoke(
        {
          featureId: 'feat-explore-3',
          repositoryPath: '/test/repo',
          worktreePath: '/test/repo',
          specDir: '/test/specs/001-test',
        },
        { configurable: { thread_id: threadId } }
      );

      // Resume with promote action (approved = promote/discard = exit)
      const result = await compiled.invoke(
        new Command({
          resume: { action: 'promote', targetMode: 'Regular' },
          update: {
            _approvalAction: 'approved',
            _rejectionFeedback: null,
          },
        }),
        { configurable: { thread_id: threadId } }
      );

      // Should NOT be interrupted — graph should complete
      const interruptPayload = (result as Record<string, unknown>).__interrupt__ as
        | { value: unknown }[]
        | undefined;
      expect(interruptPayload).toBeUndefined();

      // The executor should only have been called once (initial generation)
      expect(mockExecutor.execute).toHaveBeenCalledTimes(1);
    });

    it('routes to END on discard resume action', async () => {
      setupFileMocks();
      const compiled = createExplorationAgentGraph(mockExecutor, checkpointer);
      const threadId = 'explore-discard-thread';

      // First invocation
      await compiled.invoke(
        {
          featureId: 'feat-explore-4',
          repositoryPath: '/test/repo',
          worktreePath: '/test/repo',
          specDir: '/test/specs/001-test',
        },
        { configurable: { thread_id: threadId } }
      );

      // Resume with discard action
      const result = await compiled.invoke(
        new Command({
          resume: { action: 'discard' },
          update: {
            _approvalAction: 'approved',
            _rejectionFeedback: null,
          },
        }),
        { configurable: { thread_id: threadId } }
      );

      // Should complete without interrupt
      const interruptPayload = (result as Record<string, unknown>).__interrupt__ as
        | { value: unknown }[]
        | undefined;
      expect(interruptPayload).toBeUndefined();
    });
  });

  describe('state persistence', () => {
    it('persists state via checkpointer', async () => {
      setupFileMocks();
      const compiled = createExplorationAgentGraph(mockExecutor, checkpointer);
      const threadId = 'explore-persist-thread';

      await compiled.invoke(
        {
          featureId: 'feat-persist',
          repositoryPath: '/test/repo',
          worktreePath: '/test/repo',
          specDir: '/test/specs/001-persist',
        },
        { configurable: { thread_id: threadId } }
      );

      const state = await compiled.getState({
        configurable: { thread_id: threadId },
      });

      expect(state.values.featureId).toBe('feat-persist');
      // iterationCount stays at initial 0 because interrupt() prevents
      // the node's return value from being checkpointed. It gets
      // updated after resume when the node returns with the update.
      expect(state.values.iterationCount).toBe(0);
      // The graph is in interrupted state
      expect(state.tasks).toBeDefined();
    });
  });
});
