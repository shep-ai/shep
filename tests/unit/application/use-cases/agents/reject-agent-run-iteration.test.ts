/**
 * RejectAgentRunUseCase Iteration Tests
 *
 * Tests for the rewritten reject use case that supports iteration.
 */

import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AgentRunStatus } from '@/domain/generated/output.js';
import type { AgentRun } from '@/domain/generated/output.js';
import { RejectAgentRunUseCase } from '@/application/use-cases/agents/reject-agent-run.use-case.js';

// Mock fs and js-yaml so the use case can read a fake spec file
vi.mock('node:fs', () => ({
  readFileSync: vi.fn(),
}));

vi.mock('js-yaml', () => ({
  default: { load: vi.fn(), dump: vi.fn() },
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
    safeYamlDump: vi.fn().mockImplementation((v) => v as unknown as string),
  };
}

function createFakePhaseTimingContext(): IPhaseTimingContext {
  return {
    recordLifecycleEvent: vi.fn().mockResolvedValue(undefined),
  };
}

import { readFileSync } from 'node:fs';
import yaml from 'js-yaml';

const mockReadFileSync = vi.mocked(readFileSync);
const mockYamlLoad = vi.mocked(yaml.load);

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

describe('RejectAgentRunUseCase (iteration support)', () => {
  let useCase: RejectAgentRunUseCase;
  let mockRunRepo: ReturnType<typeof createMockRunRepository>;
  let mockProcessService: ReturnType<typeof createMockProcessService>;
  let mockFeatureRepo: ReturnType<typeof createMockFeatureRepository>;
  let mockTimingRepo: ReturnType<typeof createMockTimingRepository>;
  let fakeNodeHelpers: INodeHelpers;

  beforeEach(() => {
    vi.clearAllMocks();
    mockRunRepo = createMockRunRepository();
    mockProcessService = createMockProcessService();
    mockFeatureRepo = createMockFeatureRepository();
    mockTimingRepo = createMockTimingRepository();
    fakeNodeHelpers = createFakeNodeHelpers();
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
      fakeNodeHelpers,
      createFakePhaseTimingContext(),
      { create: vi.fn(), listByWorkItem: vi.fn().mockResolvedValue([]) } as any
    );
  });

  it('should reject and iterate on first rejection', async () => {
    mockRunRepo.findById.mockResolvedValue(createWaitingRun());
    mockReadFileSync.mockReturnValue('yaml-content');
    mockYamlLoad.mockReturnValue({ openQuestions: [] });

    const result = await useCase.execute('run-001', 'Please add error handling');

    expect(result.rejected).toBe(true);
    expect(result.iteration).toBe(1);
    expect(result.iterationWarning).toBe(false);
    expect(result.reason).toContain('iterating');
  });

  it('should append rejection feedback to spec.yaml', async () => {
    mockRunRepo.findById.mockResolvedValue(createWaitingRun());
    mockReadFileSync.mockReturnValue('yaml-content');
    mockYamlLoad.mockReturnValue({ openQuestions: [] });

    await useCase.execute('run-001', 'Add validation');

    const dumpCall = (fakeNodeHelpers.safeYamlDump as ReturnType<typeof vi.fn>).mock
      .calls[0][0] as any;
    expect(dumpCall.rejectionFeedback).toHaveLength(1);
    expect(dumpCall.rejectionFeedback[0].iteration).toBe(1);
    expect(dumpCall.rejectionFeedback[0].message).toBe('Add validation');
    expect(dumpCall.rejectionFeedback[0].timestamp).toBeDefined();
    expect(fakeNodeHelpers.writeSpecFileAtomic).toHaveBeenCalled();
  });

  it('should compute correct iteration from existing feedback', async () => {
    mockRunRepo.findById.mockResolvedValue(createWaitingRun());
    mockReadFileSync.mockReturnValue('yaml-content');
    mockYamlLoad.mockReturnValue({
      openQuestions: [],
      rejectionFeedback: [
        { iteration: 1, message: 'First fix', timestamp: '2026-01-01T00:00:00.000Z' },
        { iteration: 2, message: 'Second fix', timestamp: '2026-01-02T00:00:00.000Z' },
      ],
    });

    const result = await useCase.execute('run-001', 'Third fix');

    expect(result.iteration).toBe(3);
    expect(result.iterationWarning).toBe(false);
  });

  it('should return iterationWarning when iteration >= 5', async () => {
    mockRunRepo.findById.mockResolvedValue(createWaitingRun());
    mockReadFileSync.mockReturnValue('yaml-content');
    mockYamlLoad.mockReturnValue({
      openQuestions: [],
      rejectionFeedback: [
        { iteration: 1, message: 'Fix 1', timestamp: '' },
        { iteration: 2, message: 'Fix 2', timestamp: '' },
        { iteration: 3, message: 'Fix 3', timestamp: '' },
        { iteration: 4, message: 'Fix 4', timestamp: '' },
      ],
    });

    const result = await useCase.execute('run-001', 'Fix 5');

    expect(result.iteration).toBe(5);
    expect(result.iterationWarning).toBe(true);
  });

  it('should update run status to running (not cancelled)', async () => {
    mockRunRepo.findById.mockResolvedValue(createWaitingRun());
    mockReadFileSync.mockReturnValue('yaml-content');
    mockYamlLoad.mockReturnValue({ openQuestions: [] });

    await useCase.execute('run-001', 'Fix something');

    expect(mockRunRepo.updateStatus).toHaveBeenCalledWith(
      'run-001',
      AgentRunStatus.running,
      expect.objectContaining({ updatedAt: expect.any(Date) })
    );
  });

  it('should spawn worker with resumeFromInterrupt and rejection payload', async () => {
    mockRunRepo.findById.mockResolvedValue(createWaitingRun());
    mockReadFileSync.mockReturnValue('yaml-content');
    mockYamlLoad.mockReturnValue({ openQuestions: [] });

    await useCase.execute('run-001', 'Fix something');

    expect(mockProcessService.spawn).toHaveBeenCalledWith(
      'feat-001',
      'run-001',
      '/test/repo',
      '/test/repo/.shep/wt/feat-branch',
      '/computed/worktree/path', // computed fallback since feature has no worktreePath
      expect.objectContaining({
        resume: true,
        resumeFromInterrupt: true,
        resumePayload: expect.stringContaining('"rejected":true'),
      })
    );
    const spawnArgs = mockProcessService.spawn.mock.calls[0][5];
    const payload = JSON.parse(spawnArgs.resumePayload);
    expect(payload.rejected).toBe(true);
    expect(payload.feedback).toBe('Fix something');
    expect(payload.iteration).toBe(1);
  });

  it('should return error when run not found', async () => {
    mockRunRepo.findById.mockResolvedValue(null);

    const result = await useCase.execute('non-existent', 'Fix');

    expect(result.rejected).toBe(false);
    expect(result.reason).toContain('not found');
  });

  it('should return error when run is in running status', async () => {
    mockRunRepo.findById.mockResolvedValue(createWaitingRun({ status: AgentRunStatus.running }));

    const result = await useCase.execute('run-001', 'Fix');

    expect(result.rejected).toBe(false);
    expect(result.reason).toContain('not in a rejectable state');
  });

  it('should return error when feedback is empty', async () => {
    mockRunRepo.findById.mockResolvedValue(createWaitingRun());

    const result = await useCase.execute('run-001', '');

    expect(result.rejected).toBe(false);
    expect(result.reason).toContain('Feedback is required');
  });

  it('should return error when feedback is whitespace only', async () => {
    mockRunRepo.findById.mockResolvedValue(createWaitingRun());

    const result = await useCase.execute('run-001', '   ');

    expect(result.rejected).toBe(false);
    expect(result.reason).toContain('Feedback is required');
  });

  it('should record approval wait duration', async () => {
    const waitStart = new Date(Date.now() - 30000);
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
    mockReadFileSync.mockReturnValue('yaml-content');
    mockYamlLoad.mockReturnValue({ openQuestions: [] });

    await useCase.execute('run-001', 'Fix something');

    expect(mockTimingRepo.updateApprovalWait).toHaveBeenCalledWith('timing-001', {
      approvalWaitMs: expect.any(BigInt),
    });
  });
});
