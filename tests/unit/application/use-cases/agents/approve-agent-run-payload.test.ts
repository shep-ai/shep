/**
 * ApproveAgentRunUseCase Payload Tests
 *
 * Tests for the PrdApprovalPayload parameter extension.
 */

import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AgentRunStatus } from '@/domain/generated/output.js';
import type { AgentRun, PrdApprovalPayload } from '@/domain/generated/output.js';
import { ApproveAgentRunUseCase } from '@/application/use-cases/agents/approve-agent-run.use-case.js';

// Mock fs and js-yaml so the use case can read a fake spec file
vi.mock('node:fs', () => ({
  readFileSync: vi.fn(),
}));

vi.mock('js-yaml', () => ({
  default: { load: vi.fn(), dump: vi.fn() },
}));

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
    safeYamlDump: vi.fn().mockReturnValue('updated-yaml'),
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

describe('ApproveAgentRunUseCase with PrdApprovalPayload', () => {
  let useCase: ApproveAgentRunUseCase;
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
      specPath: '/test/repo/.shep/wt/feat-branch',
    });
    useCase = new ApproveAgentRunUseCase(
      mockRunRepo as any,
      mockProcessService as any,
      mockFeatureRepo as any,
      mockTimingRepo as any,
      createFakeWorktreePaths(),
      fakeNodeHelpers
    );
  });

  it('should work without payload (backward compatible)', async () => {
    mockRunRepo.findById.mockResolvedValue(createWaitingRun());

    const result = await useCase.execute('run-001');

    expect(result.approved).toBe(true);
    expect(mockProcessService.spawn).toHaveBeenCalledWith(
      'feat-001',
      'run-001',
      '/test/repo',
      '/test/repo/.shep/wt/feat-branch',
      '/computed/worktree/path',
      expect.not.objectContaining({ resumePayload: expect.any(String) })
    );
  });

  it('should pass serialized payload as resumePayload when provided', async () => {
    mockRunRepo.findById.mockResolvedValue(createWaitingRun());
    const payload: PrdApprovalPayload = { approved: true };

    const result = await useCase.execute('run-001', payload);

    expect(result.approved).toBe(true);
    expect(mockProcessService.spawn).toHaveBeenCalledWith(
      'feat-001',
      'run-001',
      '/test/repo',
      '/test/repo/.shep/wt/feat-branch',
      '/computed/worktree/path',
      expect.objectContaining({
        resumePayload: JSON.stringify(payload),
      })
    );
  });

  it('should write updated selections to spec.yaml when changedSelections provided', async () => {
    mockRunRepo.findById.mockResolvedValue(createWaitingRun());
    const specData = {
      openQuestions: [
        {
          question: 'Which DB?',
          options: [
            { option: 'PostgreSQL', description: 'Relational', selected: true },
            { option: 'MongoDB', description: 'Document', selected: false },
          ],
          answer: 'PostgreSQL',
        },
      ],
    };
    mockReadFileSync.mockReturnValue('yaml-content');
    mockYamlLoad.mockReturnValue(specData);

    const payload: PrdApprovalPayload = {
      approved: true,
      changedSelections: [{ questionId: 'Which DB?', selectedOption: 'MongoDB' }],
    };

    const result = await useCase.execute('run-001', payload);

    expect(result.approved).toBe(true);
    expect(fakeNodeHelpers.writeSpecFileAtomic).toHaveBeenCalled();
    // Verify the spec was updated with new selection
    const dumpCall = (fakeNodeHelpers.safeYamlDump as ReturnType<typeof vi.fn>).mock
      .calls[0][0] as any;
    const updatedQuestion = dumpCall.openQuestions[0];
    expect(updatedQuestion.answer).toBe('MongoDB');
    expect(updatedQuestion.options[0].selected).toBe(false);
    expect(updatedQuestion.options[1].selected).toBe(true);
  });

  it('should not write spec.yaml when no changedSelections', async () => {
    mockRunRepo.findById.mockResolvedValue(createWaitingRun());
    const payload: PrdApprovalPayload = { approved: true };

    await useCase.execute('run-001', payload);

    expect(fakeNodeHelpers.writeSpecFileAtomic).not.toHaveBeenCalled();
  });

  it('should not write spec.yaml when changedSelections is empty', async () => {
    mockRunRepo.findById.mockResolvedValue(createWaitingRun());
    const payload: PrdApprovalPayload = { approved: true, changedSelections: [] };

    await useCase.execute('run-001', payload);

    expect(fakeNodeHelpers.writeSpecFileAtomic).not.toHaveBeenCalled();
  });
});
