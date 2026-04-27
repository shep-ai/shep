/**
 * PRD Approval Iterations Integration Tests
 *
 * Tests the full rejection iteration cycle, approval with changes,
 * backward compatibility, and the ReviewFeatureUseCase using real
 * file I/O for spec.yaml and mocked repository interfaces.
 */

import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import yaml from 'js-yaml';
import { AgentRunStatus } from '@/domain/generated/output.js';
import type { AgentRun, PrdApprovalPayload } from '@/domain/generated/output.js';
import { RejectAgentRunUseCase } from '@/application/use-cases/agents/reject-agent-run.use-case.js';
import { ApproveAgentRunUseCase } from '@/application/use-cases/agents/approve-agent-run.use-case.js';
import { ReviewFeatureUseCase } from '@/application/use-cases/agents/review-feature.use-case.js';
import { computeWorktreePath } from '@/infrastructure/services/ide-launchers/compute-worktree-path.js';
import type { IWorktreePathProvider } from '@/application/ports/output/services/worktree-path-provider.interface.js';
import type { INodeHelpers } from '@/application/ports/output/services/node-helpers.interface.js';
import type { IPhaseTimingContext } from '@/application/ports/output/services/phase-timing-context.interface.js';
import { NodeHelpersAdapter } from '@/infrastructure/services/agents/feature-agent/nodes/node-helpers.adapter.js';

function createFakeWorktreePaths(): IWorktreePathProvider {
  return {
    getWorktreePath: (repo: string, branch: string) => computeWorktreePath(repo, branch),
  };
}

function createRealNodeHelpers(): INodeHelpers {
  return new NodeHelpersAdapter();
}

function createFakePhaseTimingContext(): IPhaseTimingContext {
  return {
    recordLifecycleEvent: vi.fn().mockResolvedValue(undefined),
  };
}

// --- Mock Factories ---

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

const SPEC_WITH_QUESTIONS = {
  name: 'Test Feature',
  oneLiner: 'A test feature',
  summary: 'Test summary',
  openQuestions: [
    {
      question: 'Which database should we use?',
      options: [
        { option: 'PostgreSQL', description: 'Relational DB', selected: true },
        { option: 'MongoDB', description: 'Document DB', selected: false },
      ],
      selectionRationale: 'Better for structured data',
      answer: 'PostgreSQL',
    },
    {
      question: 'Which framework?',
      options: [
        { option: 'Express', description: 'Minimal', selected: false },
        { option: 'Fastify', description: 'Fast', selected: true },
      ],
      answer: 'Fastify',
    },
  ],
};

// specPath will be set in beforeEach after tempDir is created
let FEATURE: Record<string, unknown>;

describe('PRD Approval Iterations (Integration)', () => {
  let tempDir: string;
  let specDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'shep-prd-iter-'));
    specDir = join(tempDir, 'specs', 'test-feature');
    mkdirSync(specDir, { recursive: true });
    FEATURE = {
      id: 'feat-001',
      name: 'test-feature',
      slug: 'test-feature',
      branch: 'feat/test-feature',
      repositoryPath: '/test/repo',
      push: false,
      openPr: false,
      agentRunId: 'run-001',
      specPath: specDir,
    };
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  function writeSpecYaml(data: Record<string, unknown>) {
    writeFileSync(join(specDir, 'spec.yaml'), yaml.dump(data), 'utf-8');
  }

  function readSpecYaml(): Record<string, unknown> {
    const content = readFileSync(join(specDir, 'spec.yaml'), 'utf-8');
    return yaml.load(content) as Record<string, unknown>;
  }

  describe('Full rejection cycle', () => {
    it('should reject, append feedback to spec.yaml, and spawn worker with rejection payload', async () => {
      writeSpecYaml(SPEC_WITH_QUESTIONS);

      const mockRunRepo = createMockRunRepository();
      const mockProcessService = createMockProcessService();
      const mockFeatureRepo = createMockFeatureRepository();
      const mockTimingRepo = createMockTimingRepository();

      mockRunRepo.findById.mockResolvedValue(createWaitingRun());
      mockFeatureRepo.findById.mockResolvedValue(FEATURE);

      const useCase = new RejectAgentRunUseCase(
        mockRunRepo as any,
        mockProcessService as any,
        mockFeatureRepo as any,
        mockTimingRepo as any,
        createFakeWorktreePaths(),
        createRealNodeHelpers(),
        createFakePhaseTimingContext()
      );

      const result = await useCase.execute('run-001', 'Please add error handling');

      // Verify result
      expect(result.rejected).toBe(true);
      expect(result.iteration).toBe(1);
      expect(result.iterationWarning).toBe(false);

      // Verify spec.yaml was updated on disk
      const updatedSpec = readSpecYaml();
      expect(updatedSpec.rejectionFeedback).toBeDefined();
      const feedback = updatedSpec.rejectionFeedback as any[];
      expect(feedback).toHaveLength(1);
      expect(feedback[0].iteration).toBe(1);
      expect(feedback[0].message).toBe('Please add error handling');
      expect(feedback[0].timestamp).toBeDefined();

      // Verify run status updated to running
      expect(mockRunRepo.updateStatus).toHaveBeenCalledWith(
        'run-001',
        AgentRunStatus.running,
        expect.objectContaining({ updatedAt: expect.any(Date) })
      );

      // Verify worker spawned with resumeFromInterrupt and rejection payload
      const expectedWorktree = computeWorktreePath('/test/repo', 'feat/test-feature');
      expect(mockProcessService.spawn).toHaveBeenCalledWith(
        'feat-001',
        'run-001',
        '/test/repo',
        specDir,
        expectedWorktree,
        expect.objectContaining({
          resume: true,
          resumeFromInterrupt: true,
          resumePayload: expect.any(String),
        })
      );
      const spawnArgs = mockProcessService.spawn.mock.calls[0][5];
      const payload = JSON.parse(spawnArgs.resumePayload);
      expect(payload.rejected).toBe(true);
      expect(payload.feedback).toBe('Please add error handling');
      expect(payload.iteration).toBe(1);
    });
  });

  describe('Approve with changed selections', () => {
    it('should update spec.yaml selections and spawn worker with approval payload', async () => {
      writeSpecYaml(SPEC_WITH_QUESTIONS);

      const mockRunRepo = createMockRunRepository();
      const mockProcessService = createMockProcessService();
      const mockFeatureRepo = createMockFeatureRepository();
      const mockTimingRepo = createMockTimingRepository();

      mockRunRepo.findById.mockResolvedValue(createWaitingRun());
      mockFeatureRepo.findById.mockResolvedValue(FEATURE);

      const useCase = new ApproveAgentRunUseCase(
        mockRunRepo as any,
        mockProcessService as any,
        mockFeatureRepo as any,
        mockTimingRepo as any,
        createFakeWorktreePaths(),
        createRealNodeHelpers()
      );

      const approvalPayload: PrdApprovalPayload = {
        approved: true,
        changedSelections: [
          { questionId: 'Which database should we use?', selectedOption: 'MongoDB' },
        ],
      };

      const result = await useCase.execute('run-001', approvalPayload);

      // Verify approval
      expect(result.approved).toBe(true);

      // Verify spec.yaml selections updated on disk
      const updatedSpec = readSpecYaml();
      const questions = updatedSpec.openQuestions as any[];
      const dbQuestion = questions.find((q: any) => q.question === 'Which database should we use?');
      expect(dbQuestion.answer).toBe('MongoDB');
      expect(dbQuestion.options[0].selected).toBe(false); // PostgreSQL deselected
      expect(dbQuestion.options[1].selected).toBe(true); // MongoDB selected

      // Framework question unchanged
      const fwQuestion = questions.find((q: any) => q.question === 'Which framework?');
      expect(fwQuestion.answer).toBe('Fastify');

      // Verify worker spawned with resumePayload
      const expectedWorktree = computeWorktreePath('/test/repo', 'feat/test-feature');
      expect(mockProcessService.spawn).toHaveBeenCalledWith(
        'feat-001',
        'run-001',
        '/test/repo',
        specDir,
        expectedWorktree,
        expect.objectContaining({
          resumePayload: JSON.stringify(approvalPayload),
        })
      );
    });
  });

  describe('Backward compatibility - approve no changes', () => {
    it('should approve without payload, no spec.yaml writes, worker spawned without resumePayload', async () => {
      writeSpecYaml(SPEC_WITH_QUESTIONS);

      const mockRunRepo = createMockRunRepository();
      const mockProcessService = createMockProcessService();
      const mockFeatureRepo = createMockFeatureRepository();
      const mockTimingRepo = createMockTimingRepository();

      mockRunRepo.findById.mockResolvedValue(createWaitingRun());
      mockFeatureRepo.findById.mockResolvedValue(FEATURE);

      const useCase = new ApproveAgentRunUseCase(
        mockRunRepo as any,
        mockProcessService as any,
        mockFeatureRepo as any,
        mockTimingRepo as any,
        createFakeWorktreePaths(),
        createRealNodeHelpers()
      );

      const result = await useCase.execute('run-001');

      expect(result.approved).toBe(true);

      // Verify spec.yaml NOT modified (read original, compare)
      const specOnDisk = readSpecYaml();
      expect(specOnDisk.rejectionFeedback).toBeUndefined();
      const questions = specOnDisk.openQuestions as any[];
      expect(questions[0].answer).toBe('PostgreSQL'); // Unchanged

      // Verify worker spawned WITHOUT resumePayload
      const spawnArgs = mockProcessService.spawn.mock.calls[0][5];
      expect(spawnArgs.resumePayload).toBeUndefined();
      expect(spawnArgs.resume).toBe(true);
      expect(spawnArgs.resumeFromInterrupt).toBe(true);
    });
  });

  describe('Multiple iterations', () => {
    it('should increment iteration count across sequential rejections', async () => {
      writeSpecYaml(SPEC_WITH_QUESTIONS);

      const mockRunRepo = createMockRunRepository();
      const mockProcessService = createMockProcessService();
      const mockFeatureRepo = createMockFeatureRepository();
      const mockTimingRepo = createMockTimingRepository();

      mockFeatureRepo.findById.mockResolvedValue(FEATURE);

      const useCase = new RejectAgentRunUseCase(
        mockRunRepo as any,
        mockProcessService as any,
        mockFeatureRepo as any,
        mockTimingRepo as any,
        createFakeWorktreePaths(),
        createRealNodeHelpers(),
        createFakePhaseTimingContext()
      );

      // Execute 3 sequential rejections
      for (let i = 1; i <= 3; i++) {
        mockRunRepo.findById.mockResolvedValue(createWaitingRun());

        const result = await useCase.execute('run-001', `Fix iteration ${i}`);

        expect(result.rejected).toBe(true);
        expect(result.iteration).toBe(i);
        expect(result.iterationWarning).toBe(false);
      }

      // Verify spec.yaml has all 3 feedback entries
      const updatedSpec = readSpecYaml();
      const feedback = updatedSpec.rejectionFeedback as any[];
      expect(feedback).toHaveLength(3);
      expect(feedback[0].iteration).toBe(1);
      expect(feedback[0].message).toBe('Fix iteration 1');
      expect(feedback[1].iteration).toBe(2);
      expect(feedback[1].message).toBe('Fix iteration 2');
      expect(feedback[2].iteration).toBe(3);
      expect(feedback[2].message).toBe('Fix iteration 3');

      // Verify spawn called 3 times
      expect(mockProcessService.spawn).toHaveBeenCalledTimes(3);
    });
  });

  describe('Iteration warning at 5+', () => {
    it('should return iterationWarning=true when iteration reaches 5', async () => {
      // Setup spec.yaml with 4 existing feedback entries
      const specWithFeedback = {
        ...SPEC_WITH_QUESTIONS,
        rejectionFeedback: [
          { iteration: 1, message: 'Fix 1', timestamp: '2026-01-01T00:00:00.000Z' },
          { iteration: 2, message: 'Fix 2', timestamp: '2026-01-02T00:00:00.000Z' },
          { iteration: 3, message: 'Fix 3', timestamp: '2026-01-03T00:00:00.000Z' },
          { iteration: 4, message: 'Fix 4', timestamp: '2026-01-04T00:00:00.000Z' },
        ],
      };
      writeSpecYaml(specWithFeedback);

      const mockRunRepo = createMockRunRepository();
      const mockProcessService = createMockProcessService();
      const mockFeatureRepo = createMockFeatureRepository();
      const mockTimingRepo = createMockTimingRepository();

      mockRunRepo.findById.mockResolvedValue(createWaitingRun());
      mockFeatureRepo.findById.mockResolvedValue(FEATURE);

      const useCase = new RejectAgentRunUseCase(
        mockRunRepo as any,
        mockProcessService as any,
        mockFeatureRepo as any,
        mockTimingRepo as any,
        createFakeWorktreePaths(),
        createRealNodeHelpers(),
        createFakePhaseTimingContext()
      );

      const result = await useCase.execute('run-001', 'Fix 5');

      expect(result.iteration).toBe(5);
      expect(result.iterationWarning).toBe(true);

      // Verify feedback array has 5 entries on disk
      const updatedSpec = readSpecYaml();
      const feedback = updatedSpec.rejectionFeedback as any[];
      expect(feedback).toHaveLength(5);
    });
  });

  describe('ReviewFeatureUseCase', () => {
    it('should return open questions from spec.yaml for a waiting feature', async () => {
      writeSpecYaml(SPEC_WITH_QUESTIONS);

      const mockFeatureRepo = createMockFeatureRepository();
      const mockRunRepo = createMockRunRepository();

      mockFeatureRepo.findById.mockResolvedValue(FEATURE);
      mockRunRepo.findById.mockResolvedValue(createWaitingRun());

      const useCase = new ReviewFeatureUseCase(mockFeatureRepo as any, mockRunRepo as any);

      const result = await useCase.execute('feat-001', '/test/repo');

      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.questions).toHaveLength(2);
      expect(result.questions[0].question).toBe('Which database should we use?');
      expect(result.questions[0].options).toHaveLength(2);
      expect(result.questions[0].selectedOption).toBe('PostgreSQL');
      expect(result.questions[0].selectionRationale).toBe('Better for structured data');
      expect(result.questions[1].question).toBe('Which framework?');
      expect(result.questions[1].selectedOption).toBe('Fastify');
      expect(result.featureName).toBe('test-feature');
      expect(result.phase).toBe('requirements');
      expect(result.runId).toBe('run-001');
    });

    it('should return error when no open questions in spec.yaml', async () => {
      writeSpecYaml({ name: 'Test', openQuestions: [] });

      const mockFeatureRepo = createMockFeatureRepository();
      const mockRunRepo = createMockRunRepository();

      mockFeatureRepo.findById.mockResolvedValue(FEATURE);
      mockRunRepo.findById.mockResolvedValue(createWaitingRun());

      const useCase = new ReviewFeatureUseCase(mockFeatureRepo as any, mockRunRepo as any);

      const result = await useCase.execute('feat-001', '/test/repo');

      expect(result.success).toBe(false);
      if (result.success) return;
      expect(result.reason).toContain('No open questions');
    });
  });
});
