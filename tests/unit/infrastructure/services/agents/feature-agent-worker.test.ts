/**
 * Feature Agent Worker Unit Tests
 *
 * Tests for the background worker entry point that runs as a child process.
 * Validates CLI arg parsing, DI initialization, graph execution, and
 * signal handling.
 *
 * TDD Phase: RED-GREEN
 */

import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AgentRunStatus, FeatureMode } from '@/domain/generated/output.js';
import type { AgentRun } from '@/domain/generated/output.js';

// Use vi.hoisted so mock fns are available when vi.mock factories run
const {
  mockInitializeContainer,
  mockResolve,
  mockGraphInvoke,
  mockFastGraphInvoke,
  mockCreateFeatureAgentGraph,
  mockCreateFastFeatureAgentGraph,
  mockCreateCheckpointer,
} = vi.hoisted(() => ({
  mockInitializeContainer: vi.fn(),
  mockResolve: vi.fn(),
  mockGraphInvoke: vi.fn(),
  mockFastGraphInvoke: vi.fn(),
  mockCreateFeatureAgentGraph: vi.fn(),
  mockCreateFastFeatureAgentGraph: vi.fn(),
  mockCreateCheckpointer: vi.fn().mockReturnValue({}),
}));

vi.mock('@/infrastructure/di/container.js', () => ({
  initializeContainer: () => mockInitializeContainer(),
  container: { resolve: (...args: unknown[]) => mockResolve(...args) },
}));

vi.mock('@/infrastructure/services/agents/feature-agent/feature-agent-graph.js', () => ({
  createFeatureAgentGraph: (...args: unknown[]) => mockCreateFeatureAgentGraph(...args),
}));

vi.mock('@/infrastructure/services/agents/feature-agent/fast-feature-agent-graph.js', () => ({
  createFastFeatureAgentGraph: (...args: unknown[]) => mockCreateFastFeatureAgentGraph(...args),
}));

vi.mock('@/infrastructure/services/agents/common/checkpointer.js', () => ({
  createCheckpointer: (...args: unknown[]) => mockCreateCheckpointer(...args),
}));

vi.mock('@/infrastructure/services/settings.service.js', () => ({
  getSettings: () => ({
    agent: { type: 'claude-code', authMethod: 'token', token: 'test' },
  }),
  initializeSettings: vi.fn(),
}));

vi.mock('@/infrastructure/services/agents/feature-agent/heartbeat.js', () => ({
  setHeartbeatContext: vi.fn(),
  reportNodeStart: vi.fn(),
}));

import {
  parseWorkerArgs,
  runWorker,
} from '@/infrastructure/services/agents/feature-agent/feature-agent-worker.js';

function makeMockRunRepository() {
  const stored = new Map<string, AgentRun>();
  return {
    create: vi.fn().mockImplementation(async (run: AgentRun) => {
      stored.set(run.id, { ...run });
    }),
    findById: vi.fn().mockImplementation(async (id: string) => {
      return stored.get(id) ?? null;
    }),
    findByThreadId: vi.fn().mockResolvedValue(null),
    updateStatus: vi
      .fn()
      .mockImplementation(
        async (id: string, status: AgentRunStatus, updates?: Partial<AgentRun>) => {
          const existing = stored.get(id);
          if (existing) {
            stored.set(id, { ...existing, status, ...updates });
          }
        }
      ),
    findRunningByPid: vi.fn().mockResolvedValue([]),
    list: vi.fn().mockResolvedValue([]),
    delete: vi.fn().mockResolvedValue(undefined),
  };
}

function makeMockExecutorProvider() {
  return {
    getExecutor: vi.fn().mockReturnValue({
      agentType: 'claude-code',
      execute: vi.fn().mockResolvedValue({ result: 'mock', sessionId: 'sess-1' }),
      executeStream: vi.fn(),
      supportsFeature: vi.fn().mockReturnValue(false),
    }),
  };
}

describe('parseWorkerArgs', () => {
  it('should parse all required CLI arguments', () => {
    const args = [
      '--feature-id',
      'feat-123',
      '--run-id',
      'run-456',
      '--repo',
      '/path/to/repo',
      '--spec-dir',
      '/path/to/specs/001-feature',
    ];

    const parsed = parseWorkerArgs(args);

    expect(parsed).toEqual({
      featureId: 'feat-123',
      runId: 'run-456',
      repo: '/path/to/repo',
      specDir: '/path/to/specs/001-feature',
      worktreePath: undefined,
      approvalGates: undefined,
      resume: false,
      threadId: undefined,
      resumeFromInterrupt: false,
      push: false,
      openPr: false,
      forkAndPr: false,
      commitSpecs: true,
      ciWatchEnabled: true,
      enableEvidence: false,
      commitEvidence: false,
      resumePayload: undefined,
      agentType: undefined,
      mode: FeatureMode.Regular,
      model: undefined,
      resumeReason: undefined,
    });
  });

  it('should parse optional worktree-path argument', () => {
    const args = [
      '--feature-id',
      'feat-123',
      '--run-id',
      'run-456',
      '--repo',
      '/path/to/repo',
      '--spec-dir',
      '/path/to/specs',
      '--worktree-path',
      '/home/user/.shep/repos/abc/wt/feat-test',
    ];

    const parsed = parseWorkerArgs(args);
    expect(parsed.worktreePath).toBe('/home/user/.shep/repos/abc/wt/feat-test');
  });

  it('should throw if feature-id is missing', () => {
    const args = ['--run-id', 'run-456', '--repo', '/repo', '--spec-dir', '/specs'];

    expect(() => parseWorkerArgs(args)).toThrow('--feature-id');
  });

  it('should throw if run-id is missing', () => {
    const args = ['--feature-id', 'feat-123', '--repo', '/repo', '--spec-dir', '/specs'];

    expect(() => parseWorkerArgs(args)).toThrow('--run-id');
  });

  it('should throw if repo is missing', () => {
    const args = ['--feature-id', 'feat-123', '--run-id', 'run-456', '--spec-dir', '/specs'];

    expect(() => parseWorkerArgs(args)).toThrow('--repo');
  });

  it('should throw if spec-dir is missing', () => {
    const args = ['--feature-id', 'feat-123', '--run-id', 'run-456', '--repo', '/repo'];

    expect(() => parseWorkerArgs(args)).toThrow('--spec-dir');
  });

  it('should parse optional approval-gates argument as JSON', () => {
    const gates = { allowPrd: true, allowPlan: false, allowMerge: false };
    const args = [
      '--feature-id',
      'feat-123',
      '--run-id',
      'run-456',
      '--repo',
      '/path/to/repo',
      '--spec-dir',
      '/path/to/specs',
      '--approval-gates',
      JSON.stringify(gates),
    ];

    const parsed = parseWorkerArgs(args);
    expect(parsed.approvalGates).toEqual(gates);
  });

  it('should parse optional resume flag', () => {
    const args = [
      '--feature-id',
      'feat-123',
      '--run-id',
      'run-456',
      '--repo',
      '/path/to/repo',
      '--spec-dir',
      '/path/to/specs',
      '--resume',
    ];

    const parsed = parseWorkerArgs(args);
    expect(parsed.resume).toBe(true);
  });

  it('should default approvalGates to undefined and resume to false', () => {
    const args = [
      '--feature-id',
      'feat-123',
      '--run-id',
      'run-456',
      '--repo',
      '/path/to/repo',
      '--spec-dir',
      '/path/to/specs',
    ];

    const parsed = parseWorkerArgs(args);
    expect(parsed.approvalGates).toBeUndefined();
    expect(parsed.resume).toBe(false);
  });

  it('should parse optional thread-id argument', () => {
    const args = [
      '--feature-id',
      'feat-123',
      '--run-id',
      'run-456',
      '--repo',
      '/path/to/repo',
      '--spec-dir',
      '/path/to/specs',
      '--thread-id',
      'thread-789',
    ];

    const parsed = parseWorkerArgs(args);
    expect(parsed.threadId).toBe('thread-789');
  });

  it('should parse optional resume-from-interrupt flag', () => {
    const args = [
      '--feature-id',
      'feat-123',
      '--run-id',
      'run-456',
      '--repo',
      '/path/to/repo',
      '--spec-dir',
      '/path/to/specs',
      '--resume',
      '--resume-from-interrupt',
    ];

    const parsed = parseWorkerArgs(args);
    expect(parsed.resume).toBe(true);
    expect(parsed.resumeFromInterrupt).toBe(true);
  });

  it('should parse optional --mode flag', () => {
    const args = [
      '--feature-id',
      'feat-123',
      '--run-id',
      'run-456',
      '--repo',
      '/path/to/repo',
      '--spec-dir',
      '/path/to/specs',
      '--mode',
      'Fast',
    ];

    const parsed = parseWorkerArgs(args);
    expect(parsed.mode).toBe(FeatureMode.Fast);
  });

  it('should default mode to Regular when not provided', () => {
    const args = [
      '--feature-id',
      'feat-123',
      '--run-id',
      'run-456',
      '--repo',
      '/path/to/repo',
      '--spec-dir',
      '/path/to/specs',
    ];

    const parsed = parseWorkerArgs(args);
    expect(parsed.mode).toBe(FeatureMode.Regular);
  });
});

describe('runWorker', () => {
  let mockRunRepo: ReturnType<typeof makeMockRunRepository>;
  let mockExecutorProvider: ReturnType<typeof makeMockExecutorProvider>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockRunRepo = makeMockRunRepository();
    mockExecutorProvider = makeMockExecutorProvider();
    mockInitializeContainer.mockResolvedValue({ resolve: mockResolve });
    mockResolve.mockImplementation((token: unknown) => {
      const key = typeof token === 'string' ? token : (token as { name?: string })?.name;
      if (key === 'IAgentRunRepository') return mockRunRepo;
      if (key === 'IAgentExecutorProvider') return mockExecutorProvider;
      // InitializeSettingsUseCase — return a mock with execute()
      if (key === 'InitializeSettingsUseCase') {
        return {
          execute: vi.fn().mockResolvedValue({
            agent: { type: 'claude-code', authMethod: 'token', token: 'test' },
          }),
        };
      }
      return mockRunRepo;
    });
    mockGraphInvoke.mockResolvedValue({
      currentNode: 'implement',
      messages: ['[analyze] done', '[implement] done'],
      error: null,
    });
    mockCreateFeatureAgentGraph.mockReturnValue({
      invoke: mockGraphInvoke,
    });
    mockFastGraphInvoke.mockResolvedValue({
      currentNode: 'fast-implement',
      messages: ['[fast-implement] done'],
      error: null,
    });
    mockCreateFastFeatureAgentGraph.mockReturnValue({
      invoke: mockFastGraphInvoke,
    });
  });

  it('should initialize the DI container', async () => {
    await runWorker({
      featureId: 'feat-1',
      runId: 'run-1',
      repo: '/repo',
      specDir: '/specs',
    });

    expect(mockInitializeContainer).toHaveBeenCalledTimes(1);
  });

  it('should resolve the agent run repository and executor factory from DI', async () => {
    await runWorker({
      featureId: 'feat-1',
      runId: 'run-1',
      repo: '/repo',
      specDir: '/specs',
    });

    expect(mockResolve).toHaveBeenCalledWith('IAgentRunRepository');
    expect(mockResolve).toHaveBeenCalledWith('IAgentExecutorProvider');
  });

  it('should create a file-based checkpointer using threadId when provided', async () => {
    await runWorker({
      featureId: 'feat-1',
      runId: 'run-1',
      repo: '/repo',
      specDir: '/specs',
      threadId: 'thread-abc',
    });

    expect(mockCreateCheckpointer).toHaveBeenCalledWith(expect.stringContaining('thread-abc'));
  });

  it('should fall back to runId for checkpointer when no threadId', async () => {
    await runWorker({
      featureId: 'feat-1',
      runId: 'run-1',
      repo: '/repo',
      specDir: '/specs',
    });

    expect(mockCreateCheckpointer).toHaveBeenCalledWith(expect.stringContaining('run-1'));
  });

  it('should create the feature agent graph with executor and checkpointer', async () => {
    await runWorker({
      featureId: 'feat-1',
      runId: 'run-1',
      repo: '/repo',
      specDir: '/specs',
    });

    // First arg is executor, second is checkpointer
    expect(mockCreateFeatureAgentGraph).toHaveBeenCalledWith(expect.anything(), expect.anything());
  });

  it('should update agent run status to running', async () => {
    await runWorker({
      featureId: 'feat-1',
      runId: 'run-1',
      repo: '/repo',
      specDir: '/specs',
    });

    expect(mockRunRepo.updateStatus).toHaveBeenCalledWith(
      'run-1',
      AgentRunStatus.running,
      expect.objectContaining({
        pid: process.pid,
      })
    );
  });

  it('should invoke the graph with correct state including worktreePath', async () => {
    await runWorker({
      featureId: 'feat-1',
      runId: 'run-1',
      repo: '/repo',
      specDir: '/specs',
      worktreePath: '/wt/path',
      threadId: 'thread-abc',
    });

    expect(mockGraphInvoke).toHaveBeenCalledWith(
      {
        featureId: 'feat-1',
        repositoryPath: '/repo',
        worktreePath: '/wt/path',
        specDir: '/specs',
        push: false,
        openPr: false,
        forkAndPr: false,
        commitSpecs: true,
        ciWatchEnabled: true,
        enableEvidence: false,
        commitEvidence: false,
      },
      { configurable: { thread_id: 'thread-abc' } }
    );
  });

  it('should default worktreePath to repo when not provided', async () => {
    await runWorker({
      featureId: 'feat-1',
      runId: 'run-1',
      repo: '/repo',
      specDir: '/specs',
    });

    expect(mockGraphInvoke).toHaveBeenCalledWith(
      expect.objectContaining({
        worktreePath: '/repo',
      }),
      expect.anything()
    );
  });

  it('should update agent run status to completed on success', async () => {
    await runWorker({
      featureId: 'feat-1',
      runId: 'run-1',
      repo: '/repo',
      specDir: '/specs',
    });

    expect(mockRunRepo.updateStatus).toHaveBeenCalledWith(
      'run-1',
      AgentRunStatus.completed,
      expect.objectContaining({
        completedAt: expect.any(Date),
      })
    );
  });

  it('should update agent run status to failed on error', async () => {
    mockGraphInvoke.mockRejectedValue(new Error('Graph execution failed'));

    await runWorker({
      featureId: 'feat-1',
      runId: 'run-1',
      repo: '/repo',
      specDir: '/specs',
    });

    expect(mockRunRepo.updateStatus).toHaveBeenCalledWith(
      'run-1',
      AgentRunStatus.failed,
      expect.objectContaining({
        error: 'Graph execution failed',
        completedAt: expect.any(Date),
      })
    );
  });

  it('should pass approvalGates in graph invoke state', async () => {
    const gates = { allowPrd: false, allowPlan: false, allowMerge: false };
    await runWorker({
      featureId: 'feat-1',
      runId: 'run-1',
      repo: '/repo',
      specDir: '/specs',
      approvalGates: gates,
      resume: false,
    });

    expect(mockGraphInvoke).toHaveBeenCalledWith(
      expect.objectContaining({
        approvalGates: gates,
      }),
      expect.anything()
    );
  });

  it('should update status to waiting_approval when graph returns with __interrupt__', async () => {
    mockGraphInvoke.mockResolvedValue({
      currentNode: 'analyze',
      messages: ['[analyze] Complete'],
      error: null,
      __interrupt__: [
        {
          value: { node: 'analyze', message: 'Approve to continue.' },
        },
      ],
    });

    await runWorker({
      featureId: 'feat-1',
      runId: 'run-1',
      repo: '/repo',
      specDir: '/specs',
      approvalGates: { allowPrd: false, allowPlan: false, allowMerge: false },
      resume: false,
    });

    expect(mockRunRepo.updateStatus).toHaveBeenCalledWith(
      'run-1',
      AgentRunStatus.waitingApproval,
      expect.objectContaining({
        updatedAt: expect.any(Date),
      })
    );
  });

  it('should invoke graph with Command resume when resuming from interrupt', async () => {
    await runWorker({
      featureId: 'feat-1',
      runId: 'run-1',
      repo: '/repo',
      specDir: '/specs',
      resume: true,
      resumeFromInterrupt: true,
      threadId: 'thread-abc',
    });

    // When resuming from interrupt, first arg should be a Command
    const firstArg = mockGraphInvoke.mock.calls[0][0];
    expect(firstArg).toBeDefined();
    expect(firstArg.resume).toBeDefined();
  });

  it('should invoke graph with initial state when resuming from error', async () => {
    await runWorker({
      featureId: 'feat-1',
      runId: 'run-1',
      repo: '/repo',
      specDir: '/specs',
      resume: true,
      resumeFromInterrupt: false,
      threadId: 'thread-abc',
    });

    // When resuming from error, first arg should be state object (not Command)
    const firstArg = mockGraphInvoke.mock.calls[0][0];
    expect(firstArg).toBeDefined();
    expect(firstArg.featureId).toBe('feat-1');
    expect(firstArg.repositoryPath).toBe('/repo');
    expect(firstArg.error).toBeUndefined();
  });

  it('should handle graph returning error state', async () => {
    mockGraphInvoke.mockResolvedValue({
      currentNode: 'analyze',
      messages: ['[analyze] Error: ENOENT'],
      error: 'ENOENT: no such file or directory',
    });

    await runWorker({
      featureId: 'feat-1',
      runId: 'run-1',
      repo: '/repo',
      specDir: '/specs',
    });

    expect(mockRunRepo.updateStatus).toHaveBeenCalledWith(
      'run-1',
      AgentRunStatus.failed,
      expect.objectContaining({
        error: 'ENOENT: no such file or directory',
      })
    );
  });

  it('should use createFastFeatureAgentGraph when fast=true', async () => {
    await runWorker({
      featureId: 'feat-1',
      runId: 'run-1',
      repo: '/repo',
      specDir: '/specs',
      mode: FeatureMode.Fast,
    });

    expect(mockCreateFastFeatureAgentGraph).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything()
    );
    expect(mockCreateFeatureAgentGraph).not.toHaveBeenCalled();
  });

  it('should use createFeatureAgentGraph when fast=false', async () => {
    await runWorker({
      featureId: 'feat-1',
      runId: 'run-1',
      repo: '/repo',
      specDir: '/specs',
      mode: FeatureMode.Regular,
    });

    expect(mockCreateFeatureAgentGraph).toHaveBeenCalledWith(expect.anything(), expect.anything());
    expect(mockCreateFastFeatureAgentGraph).not.toHaveBeenCalled();
  });

  it('should use createFeatureAgentGraph when fast is undefined', async () => {
    await runWorker({
      featureId: 'feat-1',
      runId: 'run-1',
      repo: '/repo',
      specDir: '/specs',
    });

    expect(mockCreateFeatureAgentGraph).toHaveBeenCalledWith(expect.anything(), expect.anything());
    expect(mockCreateFastFeatureAgentGraph).not.toHaveBeenCalled();
  });

  it('should invoke the fast graph with correct state when fast=true', async () => {
    await runWorker({
      featureId: 'feat-1',
      runId: 'run-1',
      repo: '/repo',
      specDir: '/specs',
      mode: FeatureMode.Fast,
      worktreePath: '/wt/path',
    });

    expect(mockFastGraphInvoke).toHaveBeenCalledWith(
      expect.objectContaining({
        featureId: 'feat-1',
        repositoryPath: '/repo',
        worktreePath: '/wt/path',
        specDir: '/specs',
      }),
      expect.anything()
    );
  });

  it('should complete successfully with fast graph', async () => {
    await runWorker({
      featureId: 'feat-1',
      runId: 'run-1',
      repo: '/repo',
      specDir: '/specs',
      mode: FeatureMode.Fast,
    });

    expect(mockRunRepo.updateStatus).toHaveBeenCalledWith(
      'run-1',
      AgentRunStatus.completed,
      expect.objectContaining({
        completedAt: expect.any(Date),
      })
    );
  });
});
