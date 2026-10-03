/**
 * Fast Feature Agent Graph Unit Tests
 *
 * Tests for the fast-mode LangGraph StateGraph that contains
 * fast-implement (+ evidence sub-agent) → merge nodes (or
 * fast-implement → END without merge deps).
 */

import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemorySaver } from '@langchain/langgraph';
import type { IAgentExecutor } from '@/application/ports/output/agents/agent-executor.interface.js';
import type { AgentType } from '@/domain/generated/output.js';

// ─── Mocks ──────────────────────────────────────────────────────────

const { mockReadFileSync, mockWriteFileSync, mockReaddirSync, mockStatSync, mockExecSync } =
  vi.hoisted(() => ({
    mockReadFileSync: vi.fn(),
    mockWriteFileSync: vi.fn(),
    mockReaddirSync: vi.fn(),
    mockStatSync: vi.fn(),
    mockExecSync: vi.fn(),
  }));

vi.mock('node:fs', async (importOriginal) => {
  // eslint-disable-next-line @typescript-eslint/consistent-type-imports
  const actual = await importOriginal<typeof import('node:fs')>();
  return {
    ...actual,
    default: {
      ...actual,
      readFileSync: mockReadFileSync,
      writeFileSync: mockWriteFileSync,
      readdirSync: mockReaddirSync,
      statSync: mockStatSync,
    },
    readFileSync: mockReadFileSync,
    writeFileSync: mockWriteFileSync,
    readdirSync: mockReaddirSync,
    statSync: mockStatSync,
  };
});

// Mock heartbeat, lifecycle, and phase-timing contexts
vi.mock('@/infrastructure/services/agents/feature-agent/heartbeat.js', () => ({
  reportNodeStart: vi.fn(),
}));

vi.mock('@/infrastructure/services/agents/feature-agent/lifecycle-context.js', () => ({
  updateNodeLifecycle: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/infrastructure/services/agents/feature-agent/phase-timing-context.js', () => ({
  getPhaseTimingRunId: vi.fn().mockReturnValue(undefined),
  recordPhaseStart: vi.fn().mockResolvedValue('timing-id'),
  recordPhaseEnd: vi.fn().mockResolvedValue(undefined),
  recordApprovalWaitStart: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('node:child_process', async (importOriginal) => {
  // eslint-disable-next-line @typescript-eslint/consistent-type-imports
  const actual = await importOriginal<typeof import('node:child_process')>();
  return {
    ...actual,
    execSync: mockExecSync,
  };
});

// Mock settings service — evidence enabled by default in tests
vi.mock('@/infrastructure/services/settings.service.js', () => ({
  hasSettings: vi.fn().mockReturnValue(true),
  getSettings: vi.fn().mockReturnValue({
    workflow: { enableEvidence: true, commitEvidence: false },
  }),
}));

const MOCK_SPEC_YAML = `name: quick-fix
userQuery: >
  Fix the typo in the README
summary: Fix typo
phase: Analysis
`;

const MOCK_FEATURE_YAML = `feature:
  id: test
status:
  phase: implementation
  completedPhases: []
`;

function setupFileMocks(): void {
  mockReadFileSync.mockImplementation((path: string) => {
    if (typeof path === 'string') {
      if (path.endsWith('spec.yaml')) return MOCK_SPEC_YAML;
      if (path.endsWith('feature.yaml')) return MOCK_FEATURE_YAML;
      if (path.endsWith('CLAUDE.md')) return '# Project\nUse TypeScript.';
      if (path.endsWith('package.json')) return '{"name": "test"}';
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
  createFastFeatureAgentGraph,
  FeatureAgentAnnotation,
} from '@/infrastructure/services/agents/feature-agent/fast-feature-agent-graph.js';

function createMockExecutor(): IAgentExecutor {
  return {
    agentType: 'claude-code' as AgentType,
    execute: vi.fn().mockResolvedValue({ result: 'Mock executor result' }),
    executeStream: vi.fn(),
    supportsFeature: vi.fn().mockReturnValue(false),
  };
}

// ─── Tests ──────────────────────────────────────────────────────────

describe('FeatureAgentAnnotation (fast graph)', () => {
  it('should be the same Annotation as the full graph', () => {
    expect(FeatureAgentAnnotation).toBeDefined();
    expect(FeatureAgentAnnotation.spec).toBeDefined();
  });
});

describe('createFastFeatureAgentGraph', () => {
  let checkpointer: MemorySaver;
  let mockExecutor: IAgentExecutor;

  beforeEach(() => {
    checkpointer = new MemorySaver();
    mockExecutor = createMockExecutor();
    mockReadFileSync.mockReset();
    mockWriteFileSync.mockReset();
    mockReaddirSync.mockReset();
    mockStatSync.mockReset();
    mockExecSync.mockReset();
    // Default: git status reports changes exist (happy path)
    mockExecSync.mockReturnValue('M  src/index.ts\n');
  });

  it('should create a compiled graph', () => {
    const compiled = createFastFeatureAgentGraph(mockExecutor, checkpointer);
    expect(compiled).toBeDefined();
  });

  it('should work without a checkpointer', () => {
    const compiled = createFastFeatureAgentGraph(mockExecutor);
    expect(compiled).toBeDefined();
  });

  it('should accept deps object with executor', () => {
    const compiled = createFastFeatureAgentGraph({ executor: mockExecutor }, checkpointer);
    expect(compiled).toBeDefined();
  });

  describe('graph structure (without merge deps)', () => {
    it('should have fast-implement node', () => {
      const compiled = createFastFeatureAgentGraph(mockExecutor, checkpointer);
      const graphRepr = compiled.getGraph();
      const nodeIds = Object.keys(graphRepr.nodes);

      expect(nodeIds).toContain('fast-implement');
    });

    it('should NOT have full pipeline nodes', () => {
      const compiled = createFastFeatureAgentGraph(mockExecutor, checkpointer);
      const graphRepr = compiled.getGraph();
      const nodeIds = Object.keys(graphRepr.nodes);

      expect(nodeIds).not.toContain('analyze');
      expect(nodeIds).not.toContain('requirements');
      expect(nodeIds).not.toContain('research');
      expect(nodeIds).not.toContain('plan');
      expect(nodeIds).not.toContain('implement');
      // Evidence is now a sub-agent within fast-implement, not a separate node
      expect(nodeIds).not.toContain('collect_evidence');
    });

    it('should have edge from START to fast-implement', () => {
      const compiled = createFastFeatureAgentGraph(mockExecutor, checkpointer);
      const graphRepr = compiled.getGraph();
      const edgePairs = graphRepr.edges.map((e) => [e.source, e.target]);

      expect(edgePairs).toContainEqual(['__start__', 'fast-implement']);
    });

    it('should have edge from fast-implement to END when no merge deps', () => {
      const compiled = createFastFeatureAgentGraph(mockExecutor, checkpointer);
      const graphRepr = compiled.getGraph();
      const edgePairs = graphRepr.edges.map((e) => [e.source, e.target]);

      expect(edgePairs).toContainEqual(['fast-implement', '__end__']);
    });
  });

  describe('node execution', () => {
    it('should call executor for fast-implement and evidence sub-agent', async () => {
      setupFileMocks();
      const compiled = createFastFeatureAgentGraph(mockExecutor, checkpointer);

      const result = await compiled.invoke(
        {
          featureId: 'feat-fast-1',
          repositoryPath: '/test/repo',
          worktreePath: '/test/repo',
          specDir: '/test/specs/001-test',
          enableEvidence: true,
          commitEvidence: false,
        },
        { configurable: { thread_id: 'fast-thread-1' } }
      );

      // Called twice: once for fast-implement, once for evidence sub-agent within fast-implement
      expect(mockExecutor.execute).toHaveBeenCalledTimes(2);
      expect(result.currentNode).toBe('fast-implement');
    });

    it('should accumulate messages from fast-implement including evidence', async () => {
      setupFileMocks();
      const compiled = createFastFeatureAgentGraph(mockExecutor, checkpointer);

      const result = await compiled.invoke(
        {
          featureId: 'feat-fast-2',
          repositoryPath: '/test/repo',
          worktreePath: '/test/repo',
          specDir: '/test/specs/001-test',
          enableEvidence: true,
          commitEvidence: false,
        },
        { configurable: { thread_id: 'fast-thread-2' } }
      );

      expect(result.messages.length).toBeGreaterThanOrEqual(2);
      expect(result.messages.some((m: string) => m.includes('[fast-implement]'))).toBe(true);
    });

    it('should throw on executor errors for resumability', async () => {
      setupFileMocks();
      (mockExecutor.execute as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('Process exited with code 1')
      );

      const compiled = createFastFeatureAgentGraph(mockExecutor, checkpointer);

      await expect(
        compiled.invoke(
          {
            featureId: 'feat-err',
            repositoryPath: '/test/repo',
            worktreePath: '/test/repo',
            specDir: '/test/specs/001-test',
            enableEvidence: true,
            commitEvidence: false,
          },
          { configurable: { thread_id: 'err-thread' } }
        )
      ).rejects.toThrow('Process exited with code 1');
    });
  });

  describe('state persistence', () => {
    it('should persist state across invocations via checkpointer', async () => {
      setupFileMocks();
      const compiled = createFastFeatureAgentGraph(mockExecutor, checkpointer);

      await compiled.invoke(
        {
          featureId: 'feat-persist',
          repositoryPath: '/test/repo',
          worktreePath: '/test/repo',
          specDir: '/test/specs/001-persist',
          enableEvidence: true,
          commitEvidence: false,
        },
        { configurable: { thread_id: 'persist-thread' } }
      );

      const state = await compiled.getState({
        configurable: { thread_id: 'persist-thread' },
      });

      expect(state.values.featureId).toBe('feat-persist');
      expect(state.values.messages.length).toBeGreaterThan(0);
      expect(state.values.currentNode).toBe('fast-implement');
    });
  });

  describe('graph uses FeatureAgentAnnotation state', () => {
    it('should accept all standard state fields', async () => {
      setupFileMocks();
      const compiled = createFastFeatureAgentGraph(mockExecutor, checkpointer);

      const result = await compiled.invoke(
        {
          featureId: 'feat-state',
          repositoryPath: '/test/repo',
          worktreePath: '/test/repo',
          specDir: '/test/specs/001-test',
          enableEvidence: true,
          commitEvidence: false,
          approvalGates: { allowPrd: true, allowPlan: true, allowMerge: false },
          push: true,
          openPr: true,
        },
        { configurable: { thread_id: 'state-thread' } }
      );

      // State should flow through correctly
      expect(result.approvalGates).toEqual({
        allowPrd: true,
        allowPlan: true,
        allowMerge: false,
      });
      expect(result.push).toBe(true);
      expect(result.openPr).toBe(true);
      expect(result.error).toBeNull();
    });
  });
});
