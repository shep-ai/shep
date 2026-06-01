/**
 * ReviewFeatureUseCase Unit Tests
 *
 * Tests for reading spec.yaml open questions for TUI review wizard.
 */

import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { join } from 'node:path';
import { AgentRunStatus } from '@/domain/generated/output.js';
import type { AgentRun } from '@/domain/generated/output.js';
import { ReviewFeatureUseCase } from '@/application/use-cases/agents/review-feature.use-case.js';

// Mock fs and js-yaml
vi.mock('node:fs', () => ({
  readFileSync: vi.fn(),
}));

vi.mock('js-yaml', () => ({
  default: { load: vi.fn() },
}));

import { readFileSync } from 'node:fs';
import yaml from 'js-yaml';

const mockReadFileSync = vi.mocked(readFileSync);
const mockYamlLoad = vi.mocked(yaml.load);

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

function createMockAgentRunRepository() {
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

const SPEC_YAML_WITH_QUESTIONS = {
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

describe('ReviewFeatureUseCase', () => {
  let useCase: ReviewFeatureUseCase;
  let mockFeatureRepo: ReturnType<typeof createMockFeatureRepository>;
  let mockRunRepo: ReturnType<typeof createMockAgentRunRepository>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockFeatureRepo = createMockFeatureRepository();
    mockRunRepo = createMockAgentRunRepository();
    useCase = new ReviewFeatureUseCase(mockFeatureRepo as any, mockRunRepo as any);
  });

  it('should return open questions from spec.yaml for a waiting feature', async () => {
    mockFeatureRepo.findById.mockResolvedValue({
      id: 'feat-001',
      name: 'test-feature',
      slug: 'test-feature',
      branch: 'feat/test-feature',
      agentRunId: 'run-001',
      repositoryPath: '/test/repo',
      specPath: '/test/repo/.shep/wt/feat-branch',
    });
    mockRunRepo.findById.mockResolvedValue(createWaitingRun());
    mockReadFileSync.mockReturnValue('yaml-content');
    mockYamlLoad.mockReturnValue(SPEC_YAML_WITH_QUESTIONS);

    const result = await useCase.execute('feat-001', '/test/repo');

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.questions).toHaveLength(2);
    expect(result.questions[0].question).toBe('Which database should we use?');
    expect(result.questions[0].options).toHaveLength(2);
    expect(result.questions[0].selectedOption).toBe('PostgreSQL');
    expect(result.questions[0].selectionRationale).toBe('Better for structured data');
    expect(result.featureName).toBe('test-feature');
    expect(result.runId).toBe('run-001');
  });

  it('should return error when feature not found', async () => {
    mockFeatureRepo.findById.mockResolvedValue(null);
    mockFeatureRepo.findByIdPrefix.mockResolvedValue(null);

    const result = await useCase.execute('non-existent', '/test/repo');

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.reason).toContain('not found');
  });

  it('should fallback to findByIdPrefix when findById returns null', async () => {
    mockFeatureRepo.findById.mockResolvedValue(null);
    mockFeatureRepo.findByIdPrefix.mockResolvedValue({
      id: 'feat-001-full',
      name: 'test-feature',
      slug: 'test-feature',
      branch: 'feat/test-feature',
      agentRunId: 'run-001',
      repositoryPath: '/test/repo',
      specPath: '/test/repo/.shep/wt/feat-branch',
    });
    mockRunRepo.findById.mockResolvedValue(createWaitingRun());
    mockReadFileSync.mockReturnValue('yaml-content');
    mockYamlLoad.mockReturnValue(SPEC_YAML_WITH_QUESTIONS);

    const result = await useCase.execute('feat-001', '/test/repo');

    expect(result.success).toBe(true);
    expect(mockFeatureRepo.findByIdPrefix).toHaveBeenCalledWith('feat-001');
  });

  it('should return error when feature has no agent run', async () => {
    mockFeatureRepo.findById.mockResolvedValue({
      id: 'feat-001',
      name: 'test-feature',
      slug: 'test-feature',
      branch: 'feat/test-feature',
      repositoryPath: '/test/repo',
    });

    const result = await useCase.execute('feat-001', '/test/repo');

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.reason).toContain('no agent run');
  });

  it('should return error when run is not in waiting_approval status', async () => {
    mockFeatureRepo.findById.mockResolvedValue({
      id: 'feat-001',
      name: 'test-feature',
      slug: 'test-feature',
      branch: 'feat/test-feature',
      agentRunId: 'run-001',
      repositoryPath: '/test/repo',
      specPath: '/test/repo/.shep/wt/feat-branch',
    });
    mockRunRepo.findById.mockResolvedValue(createWaitingRun({ status: AgentRunStatus.running }));

    const result = await useCase.execute('feat-001', '/test/repo');

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.reason).toContain('not waiting for approval');
  });

  it('should return error when spec.yaml cannot be read', async () => {
    mockFeatureRepo.findById.mockResolvedValue({
      id: 'feat-001',
      name: 'test-feature',
      slug: 'test-feature',
      branch: 'feat/test-feature',
      agentRunId: 'run-001',
      repositoryPath: '/test/repo',
      specPath: '/test/repo/.shep/wt/feat-branch',
    });
    mockRunRepo.findById.mockResolvedValue(createWaitingRun());
    mockReadFileSync.mockImplementation(() => {
      throw new Error('ENOENT');
    });

    const result = await useCase.execute('feat-001', '/test/repo');

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.reason).toContain('Could not read spec.yaml');
  });

  it('should return error when no open questions found', async () => {
    mockFeatureRepo.findById.mockResolvedValue({
      id: 'feat-001',
      name: 'test-feature',
      slug: 'test-feature',
      branch: 'feat/test-feature',
      agentRunId: 'run-001',
      repositoryPath: '/test/repo',
      specPath: '/test/repo/.shep/wt/feat-branch',
    });
    mockRunRepo.findById.mockResolvedValue(createWaitingRun());
    mockReadFileSync.mockReturnValue('yaml-content');
    mockYamlLoad.mockReturnValue({ openQuestions: [] });

    const result = await useCase.execute('feat-001', '/test/repo');

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.reason).toContain('No open questions');
  });

  it('should construct spec path using feature specPath', async () => {
    mockFeatureRepo.findById.mockResolvedValue({
      id: 'feat-001',
      name: 'test-feature',
      slug: 'my-feature',
      branch: 'feat/test-feature',
      agentRunId: 'run-001',
      repositoryPath: '/test/repo',
      specPath: '/test/repo/.shep/wt/feat-branch/specs/my-feature',
    });
    mockRunRepo.findById.mockResolvedValue(createWaitingRun());
    mockReadFileSync.mockReturnValue('yaml-content');
    mockYamlLoad.mockReturnValue(SPEC_YAML_WITH_QUESTIONS);

    await useCase.execute('feat-001', '/test/repo');

    expect(mockReadFileSync).toHaveBeenCalledWith(
      join('/test/repo/.shep/wt/feat-branch/specs/my-feature', 'spec.yaml'),
      'utf-8'
    );
  });
});
