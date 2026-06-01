/**
 * Reject Agent Run Use Case Unit Tests
 *
 * Tests for rejecting a paused agent run (human-in-the-loop).
 * Tests the basic validation paths (not found, wrong status, empty feedback).
 * See reject-agent-run-iteration.test.ts for iteration-specific tests.
 */

import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AgentRunStatus } from '@/domain/generated/output.js';
import type { AgentRun } from '@/domain/generated/output.js';
import { RejectAgentRunUseCase } from '@/application/use-cases/agents/reject-agent-run.use-case.js';

// Mock fs, js-yaml, and writeSpecFileAtomic
vi.mock('node:fs', () => ({
  readFileSync: vi.fn().mockReturnValue('{}'),
}));

vi.mock('js-yaml', () => ({
  default: {
    load: vi.fn().mockReturnValue({ openQuestions: [] }),
    dump: vi.fn().mockReturnValue('yaml'),
  },
}));

import type { IWorktreePathProvider } from '@/application/ports/output/services/worktree-path-provider.interface.js';
import type { INodeHelpers } from '@/application/ports/output/services/node-helpers.interface.js';
import type { IPhaseTimingContext } from '@/application/ports/output/services/phase-timing-context.interface.js';

function createFakeWorktreePaths(): IWorktreePathProvider {
  return {
    getWorktreePath: vi.fn().mockReturnValue('/computed/worktree/path'),
  };
}

function createFakeNodeHelpers(): INodeHelpers {
  return {
    writeSpecFileAtomic: vi.fn(),
    safeYamlDump: vi.fn().mockReturnValue('yaml'),
  };
}

function createFakePhaseTimingContext(): IPhaseTimingContext {
  return {
    recordLifecycleEvent: vi.fn().mockResolvedValue(undefined),
  };
}

function createMockRunRepository() {
  return {
    create: vi.fn(),
    findById: vi.fn(),
    findByThreadId: vi.fn(),
    findLatestByFeatureId: vi.fn().mockResolvedValue(null),
    findByIds: vi.fn().mockResolvedValue([]),
    updateStatus: vi.fn(),
    findRunningByPid: vi.fn(),
    list: vi.fn(),
    delete: vi.fn(),
  };
}

function createMockProcessService() {
  return {
    spawn: vi.fn().mockReturnValue(12345),
    isAlive: vi.fn().mockReturnValue(true),
    checkAndMarkCrashed: vi.fn(),
  };
}

function createMockFeatureRepository() {
  return {
    create: vi.fn(),
    findById: vi.fn(),
    findByIdPrefix: vi.fn(),
    findBySlug: vi.fn(),
    list: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  };
}

function createMockTimingRepository() {
  return {
    save: vi.fn(),
    update: vi.fn(),
    updateApprovalWait: vi.fn(),
    findByRunId: vi.fn().mockResolvedValue([]),
    findByRunIds: vi.fn().mockResolvedValue([]),
    findByFeatureId: vi.fn(),
  };
}

function createWaitingRun(overrides?: Partial<AgentRun>): AgentRun {
  return {
    id: 'run-001',
    agentType: 'claude-code' as any,
    agentName: 'feature-agent',
    status: AgentRunStatus.waitingApproval,
    prompt: 'Test prompt',
    threadId: 'thread-001',
    featureId: 'feat-001',
    repositoryPath: '/test/repo',
    approvalGates: { allowPrd: false, allowPlan: false, allowMerge: false },
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('RejectAgentRunUseCase', () => {
  let useCase: RejectAgentRunUseCase;
  let mockRunRepo: ReturnType<typeof createMockRunRepository>;
  let mockProcessService: ReturnType<typeof createMockProcessService>;
  let mockFeatureRepo: ReturnType<typeof createMockFeatureRepository>;
  let mockTimingRepo: ReturnType<typeof createMockTimingRepository>;
  let fakePhaseTimingContext: IPhaseTimingContext;

  beforeEach(() => {
    vi.clearAllMocks();
    mockRunRepo = createMockRunRepository();
    mockProcessService = createMockProcessService();
    mockFeatureRepo = createMockFeatureRepository();
    mockTimingRepo = createMockTimingRepository();
    fakePhaseTimingContext = createFakePhaseTimingContext();
    mockFeatureRepo.findById.mockResolvedValue({
      id: 'feat-001',
      name: 'test-feature',
      slug: 'test-feature',
      branch: 'feat/test-feature',
      repositoryPath: '/test/repo',
      push: false,
      openPr: false,
      specPath: '/test/repo/.shep/wt/feat-branch',
    });
    useCase = new RejectAgentRunUseCase(
      mockRunRepo as any,
      mockProcessService as any,
      mockFeatureRepo as any,
      mockTimingRepo as any,
      createFakeWorktreePaths(),
      createFakeNodeHelpers(),
      fakePhaseTimingContext,
      { create: vi.fn(), listByWorkItem: vi.fn().mockResolvedValue([]) } as any
    );
  });

  it('should reject a waiting agent run and iterate', async () => {
    mockRunRepo.findById.mockResolvedValue(createWaitingRun());

    const result = await useCase.execute('run-001', 'User rejected the plan');

    expect(result.rejected).toBe(true);
    expect(mockRunRepo.updateStatus).toHaveBeenCalledWith(
      'run-001',
      AgentRunStatus.running,
      expect.objectContaining({
        updatedAt: expect.any(Date),
      })
    );
  });

  it('should record run:rejected lifecycle event on rejection', async () => {
    mockRunRepo.findById.mockResolvedValue(createWaitingRun());

    await useCase.execute('run-001', 'Needs more detail');

    expect(fakePhaseTimingContext.recordLifecycleEvent).toHaveBeenCalledWith(
      'run:rejected',
      'run-001',
      mockTimingRepo
    );
  });

  it('should resume the same run with its persisted switched agentType and modelId', async () => {
    mockRunRepo.findById.mockResolvedValue(
      createWaitingRun({
        agentType: 'codex-cli' as any,
        modelId: 'gpt-5.4',
        threadId: 'thread-switched',
      })
    );

    await useCase.execute('run-001', 'Use the updated executor');

    expect(mockProcessService.spawn).toHaveBeenCalledWith(
      'feat-001',
      'run-001',
      '/test/repo',
      '/test/repo/.shep/wt/feat-branch',
      '/computed/worktree/path',
      expect.objectContaining({
        resume: true,
        threadId: 'thread-switched',
        agentType: 'codex-cli',
        model: 'gpt-5.4',
        resumePayload: expect.stringContaining('Use the updated executor'),
      })
    );
  });

  it('should return error when run not found', async () => {
    mockRunRepo.findById.mockResolvedValue(null);

    const result = await useCase.execute('non-existent', 'feedback');

    expect(result.rejected).toBe(false);
    expect(result.reason).toContain('not found');
  });

  it('should return error when run is in completed status', async () => {
    mockRunRepo.findById.mockResolvedValue(createWaitingRun({ status: AgentRunStatus.completed }));

    const result = await useCase.execute('run-001', 'feedback');

    expect(result.rejected).toBe(false);
  });

  it('should accept failed status for rejection (resume failed feature with feedback)', async () => {
    mockRunRepo.findById.mockResolvedValue(createWaitingRun({ status: AgentRunStatus.failed }));

    const result = await useCase.execute('run-001', 'fix the merge conflicts');

    expect(result.rejected).toBe(true);
    expect(mockProcessService.spawn).toHaveBeenCalledWith(
      'feat-001',
      'run-001',
      expect.any(String),
      expect.any(String),
      expect.any(String),
      expect.objectContaining({
        resume: true,
        resumeFromInterrupt: true,
        resumePayload: expect.stringContaining('fix the merge conflicts'),
      })
    );
  });

  it('should accept interrupted status for rejection (resume crashed feature with feedback)', async () => {
    mockRunRepo.findById.mockResolvedValue(
      createWaitingRun({ status: AgentRunStatus.interrupted })
    );

    const result = await useCase.execute('run-001', 'try again with different approach');

    expect(result.rejected).toBe(true);
    expect(mockProcessService.spawn).toHaveBeenCalledWith(
      'feat-001',
      'run-001',
      expect.any(String),
      expect.any(String),
      expect.any(String),
      expect.objectContaining({
        resume: true,
        resumeFromInterrupt: true,
        resumePayload: expect.stringContaining('try again with different approach'),
      })
    );
  });

  it('should return error when feedback is empty', async () => {
    mockRunRepo.findById.mockResolvedValue(createWaitingRun());

    const result = await useCase.execute('run-001', '');

    expect(result.rejected).toBe(false);
    expect(result.reason).toContain('Feedback is required');
  });

  it('should compute worktree path when feature.worktreePath is undefined', async () => {
    mockRunRepo.findById.mockResolvedValue(createWaitingRun());
    mockFeatureRepo.findById.mockResolvedValue({
      id: 'feat-001',
      name: 'test-feature',
      slug: 'test-feature',
      branch: 'feat/test-feature',
      repositoryPath: '/test/repo',
      push: false,
      openPr: false,
      specPath: '/test/specs',
      // worktreePath is intentionally undefined
    });

    await useCase.execute('run-001', 'fix this');

    // Should pass computed path as 5th argument to spawn
    expect(mockProcessService.spawn).toHaveBeenCalledWith(
      'feat-001',
      'run-001',
      '/test/repo',
      '/test/specs',
      '/computed/worktree/path',
      expect.any(Object)
    );
  });

  it('should use feature.worktreePath when available', async () => {
    mockRunRepo.findById.mockResolvedValue(createWaitingRun());
    mockFeatureRepo.findById.mockResolvedValue({
      id: 'feat-001',
      name: 'test-feature',
      slug: 'test-feature',
      branch: 'feat/test-feature',
      repositoryPath: '/test/repo',
      push: false,
      openPr: false,
      specPath: '/test/specs',
      worktreePath: '/existing/worktree',
    });

    await useCase.execute('run-001', 'fix this');

    // Should use existing worktreePath, not computed one
    expect(mockProcessService.spawn).toHaveBeenCalledWith(
      'feat-001',
      'run-001',
      '/test/repo',
      '/test/specs',
      '/existing/worktree',
      expect.any(Object)
    );
  });
});
