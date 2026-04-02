/**
 * Prototype-Generate Node Tests
 *
 * Note: When testing nodes that call interrupt() outside a LangGraph graph
 * context, the interrupt() call throws a regular Error. We test the node
 * behavior up to the interrupt point and verify the executor was called
 * correctly. Full interrupt/resume behavior is tested in the graph
 * integration tests.
 */

import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { IAgentExecutor } from '@/application/ports/output/agents/agent-executor.interface.js';
import type { AgentType } from '@/domain/generated/output.js';
import type { FeatureAgentState } from '@/infrastructure/services/agents/feature-agent/state.js';

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

import { createPrototypeGenerateNode } from '@/infrastructure/services/agents/feature-agent/nodes/prototype-generate.node.js';

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

function createMockExecutor(): IAgentExecutor {
  return {
    agentType: 'claude-code' as AgentType,
    execute: vi.fn().mockResolvedValue({ result: 'Generated prototype code' }),
    executeStream: vi.fn(),
    supportsFeature: vi.fn().mockReturnValue(false),
  };
}

function createMockState(overrides?: Partial<FeatureAgentState>): FeatureAgentState {
  return {
    featureId: 'feat-explore-1',
    repositoryPath: '/test/repo',
    specDir: '/test/specs/082-explore',
    worktreePath: '/test/worktree',
    currentNode: '',
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
    iterationCount: 0,
    maxIterations: 10,
    feedbackHistory: [],
    explorationStatus: 'generating',
    ...overrides,
  };
}

// ─── Tests ──────────────────────────────────────────────────────────

describe('createPrototypeGenerateNode', () => {
  let mockExecutor: IAgentExecutor;

  beforeEach(() => {
    mockExecutor = createMockExecutor();
    mockReadFileSync.mockReset();
    mockReaddirSync.mockReset();
    mockStatSync.mockReset();
  });

  it('calls executor with prototype generate prompt', async () => {
    setupFileMocks();
    const node = createPrototypeGenerateNode(mockExecutor);
    const state = createMockState();

    // The node calls interrupt() which throws outside graph context
    try {
      await node(state);
    } catch {
      // Expected — interrupt() throws outside graph context
    }

    expect(mockExecutor.execute).toHaveBeenCalledTimes(1);
    const prompt = (mockExecutor.execute as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(prompt).toContain('EXPLORATION MODE');
    expect(prompt).toContain('Add workspace grouping');
  });

  it('interrupts after generation (throws outside graph context)', async () => {
    setupFileMocks();
    const node = createPrototypeGenerateNode(mockExecutor);
    const state = createMockState();

    // interrupt() throws when called outside a graph context
    await expect(node(state)).rejects.toThrow();
    // The executor should have been called before the interrupt
    expect(mockExecutor.execute).toHaveBeenCalledTimes(1);
  });

  it('does not call executor when iterationCount reaches maxIterations', async () => {
    setupFileMocks();
    const node = createPrototypeGenerateNode(mockExecutor);
    const state = createMockState({ iterationCount: 10, maxIterations: 10 });

    // Should throw from interrupt() at max iterations
    await expect(node(state)).rejects.toThrow();

    // Should NOT have called the executor when at max iterations
    expect(mockExecutor.execute).not.toHaveBeenCalled();
  });

  it('throws non-interrupt errors for resumability', async () => {
    setupFileMocks();
    (mockExecutor.execute as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('Process exited with code 1')
    );

    const node = createPrototypeGenerateNode(mockExecutor);
    const state = createMockState();

    await expect(node(state)).rejects.toThrow('[prototype-generate] Process exited with code 1');
  });

  it('builds prompt with feedback history for subsequent iterations', async () => {
    setupFileMocks();
    const node = createPrototypeGenerateNode(mockExecutor);
    const state = createMockState({
      iterationCount: 2,
      feedbackHistory: ['make it blue', 'add a sidebar'],
    });

    try {
      await node(state);
    } catch {
      // Expected — interrupt()
    }

    expect(mockExecutor.execute).toHaveBeenCalledTimes(1);
    const prompt = (mockExecutor.execute as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(prompt).toContain('make it blue');
    expect(prompt).toContain('add a sidebar');
    expect(prompt).toContain('Current Iteration: 3');
  });

  it('uses correct working directory in executor options', async () => {
    setupFileMocks();
    const node = createPrototypeGenerateNode(mockExecutor);
    const state = createMockState({ worktreePath: '/custom/worktree' });

    try {
      await node(state);
    } catch {
      // Expected
    }

    const options = (mockExecutor.execute as ReturnType<typeof vi.fn>).mock.calls[0][1];
    expect(options.cwd).toBe('/custom/worktree');
  });
});
