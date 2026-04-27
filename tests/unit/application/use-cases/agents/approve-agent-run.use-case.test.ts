/**
 * Approve Agent Run Use Case Unit Tests
 *
 * Tests for approving a paused agent run (human-in-the-loop).
 *
 * TDD Phase: RED
 */

import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { AgentRunStatus } from '@/domain/generated/output.js';
import type { AgentRun } from '@/domain/generated/output.js';
import { ApproveAgentRunUseCase } from '@/application/use-cases/agents/approve-agent-run.use-case.js';
import type { IWorktreePathProvider } from '@/application/ports/output/services/worktree-path-provider.interface.js';
import type { INodeHelpers } from '@/application/ports/output/services/node-helpers.interface.js';

function createFakeWorktreePaths(): IWorktreePathProvider {
  return {
    getWorktreePath: vi.fn().mockReturnValue('/computed/worktree/path'),
  };
}

function createFakeNodeHelpers(): INodeHelpers {
  return {
    writeSpecFileAtomic: vi.fn(),
    safeYamlDump: vi.fn().mockReturnValue(''),
  };
}

function createMockRunRepository() {
  return {
    create: vi.fn(),
    findById: vi.fn(),
    findByThreadId: vi.fn(),
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

describe('ApproveAgentRunUseCase', () => {
  let useCase: ApproveAgentRunUseCase;
  let mockRunRepo: ReturnType<typeof createMockRunRepository>;
  let mockProcessService: ReturnType<typeof createMockProcessService>;
  let mockFeatureRepo: ReturnType<typeof createMockFeatureRepository>;
  let mockTimingRepo: ReturnType<typeof createMockTimingRepository>;

  beforeEach(() => {
    mockRunRepo = createMockRunRepository();
    mockProcessService = createMockProcessService();
    mockFeatureRepo = createMockFeatureRepository();
    mockTimingRepo = createMockTimingRepository();
    mockFeatureRepo.findById.mockResolvedValue({
      id: 'feat-001',
      branch: 'feat/test-feature',
      repositoryPath: '/test/repo',
      specPath: '/test/repo/.shep/wt/feat-branch',
      worktreePath: '/test/repo/.shep/wt/feat-branch',
    });
    useCase = new ApproveAgentRunUseCase(
      mockRunRepo as any,
      mockProcessService as any,
      mockFeatureRepo as any,
      mockTimingRepo as any,
      createFakeWorktreePaths(),
      createFakeNodeHelpers()
    );
  });

  it('should approve a waiting agent run and spawn a resume worker', async () => {
    mockRunRepo.findById.mockResolvedValue(createWaitingRun());

    const result = await useCase.execute('run-001');

    expect(result.approved).toBe(true);
    expect(mockRunRepo.updateStatus).toHaveBeenCalledWith(
      'run-001',
      AgentRunStatus.running,
      expect.objectContaining({
        updatedAt: expect.any(Date),
      })
    );
    const wt = '/test/repo/.shep/wt/feat-branch';
    expect(mockProcessService.spawn).toHaveBeenCalledWith(
      'feat-001',
      'run-001',
      '/test/repo',
      wt,
      wt,
      expect.objectContaining({
        resume: true,
        threadId: 'thread-001',
        resumeFromInterrupt: true,
        approvalGates: { allowPrd: false, allowPlan: false, allowMerge: false },
      })
    );
  });

  it('should pass run.agentType to processService.spawn options', async () => {
    mockRunRepo.findById.mockResolvedValue(createWaitingRun({ agentType: 'dev' as any }));

    await useCase.execute('run-001');

    expect(mockProcessService.spawn).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      expect.any(String),
      expect.any(String),
      expect.any(String),
      expect.objectContaining({
        agentType: 'dev',
      })
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

    await useCase.execute('run-001');

    const wt = '/test/repo/.shep/wt/feat-branch';
    expect(mockProcessService.spawn).toHaveBeenCalledWith(
      'feat-001',
      'run-001',
      '/test/repo',
      wt,
      wt,
      expect.objectContaining({
        resume: true,
        threadId: 'thread-switched',
        agentType: 'codex-cli',
        model: 'gpt-5.4',
      })
    );
  });

  it('should return error when run not found', async () => {
    mockRunRepo.findById.mockResolvedValue(null);

    const result = await useCase.execute('non-existent');

    expect(result.approved).toBe(false);
    expect(result.reason).toContain('not found');
  });

  it('should return error when run is in running status', async () => {
    mockRunRepo.findById.mockResolvedValue(createWaitingRun({ status: AgentRunStatus.running }));

    const result = await useCase.execute('run-001');

    expect(result.approved).toBe(false);
  });

  it('should accept failed status for approval (retry failed feature)', async () => {
    mockRunRepo.findById.mockResolvedValue(createWaitingRun({ status: AgentRunStatus.failed }));

    const result = await useCase.execute('run-001');

    expect(result.approved).toBe(true);
    expect(mockProcessService.spawn).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      expect.any(String),
      expect.any(String),
      expect.any(String),
      expect.objectContaining({
        resume: true,
        resumeFromInterrupt: true,
      })
    );
  });

  it('should accept interrupted status for approval (retry crashed feature)', async () => {
    mockRunRepo.findById.mockResolvedValue(
      createWaitingRun({ status: AgentRunStatus.interrupted })
    );

    const result = await useCase.execute('run-001');

    expect(result.approved).toBe(true);
    expect(mockProcessService.spawn).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      expect.any(String),
      expect.any(String),
      expect.any(String),
      expect.objectContaining({
        resume: true,
        resumeFromInterrupt: true,
      })
    );
  });

  it('should compute and record approval wait duration', async () => {
    const waitStart = new Date(Date.now() - 60000); // 60s ago
    mockRunRepo.findById.mockResolvedValue(createWaitingRun());
    mockTimingRepo.findByRunId.mockResolvedValue([
      {
        id: 'timing-001',
        agentRunId: 'run-001',
        phase: 'requirements',
        startedAt: new Date(),
        waitingApprovalAt: waitStart,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);

    await useCase.execute('run-001');

    expect(mockTimingRepo.findByRunId).toHaveBeenCalledWith('run-001');
    expect(mockTimingRepo.updateApprovalWait).toHaveBeenCalledWith('timing-001', {
      approvalWaitMs: expect.any(BigInt),
    });
    // Verify the wait duration is approximately 60 seconds
    const callArgs = mockTimingRepo.updateApprovalWait.mock.calls[0][1];
    expect(Number(callArgs.approvalWaitMs)).toBeGreaterThanOrEqual(59000);
    expect(Number(callArgs.approvalWaitMs)).toBeLessThan(62000);
  });

  it('should skip approval wait recording when no waiting timing exists', async () => {
    mockRunRepo.findById.mockResolvedValue(createWaitingRun());
    mockTimingRepo.findByRunId.mockResolvedValue([]);

    await useCase.execute('run-001');

    expect(mockTimingRepo.updateApprovalWait).not.toHaveBeenCalled();
  });

  it('should not block approval when timing repo fails', async () => {
    mockRunRepo.findById.mockResolvedValue(createWaitingRun());
    mockTimingRepo.findByRunId.mockRejectedValue(new Error('DB error'));

    const result = await useCase.execute('run-001');

    expect(result.approved).toBe(true);
    expect(mockProcessService.spawn).toHaveBeenCalled();
  });
});
