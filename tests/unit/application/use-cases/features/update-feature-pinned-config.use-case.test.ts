import 'reflect-metadata';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { UpdateFeaturePinnedConfigUseCase } from '@/application/use-cases/features/update-feature-pinned-config.use-case.js';
import { AgentRunStatus, AgentType, SdlcLifecycle, BuildMode } from '@/domain/generated/output.js';
import type { AgentRun, Feature } from '@/domain/generated/output.js';

function createMockFeatureRepo() {
  return {
    create: vi.fn(),
    findById: vi.fn(),
    findByIdPrefix: vi.fn(),
    findBySlug: vi.fn(),
    findByBranch: vi.fn(),
    list: vi.fn(),
    update: vi.fn(),
    findByParentId: vi.fn(),
    delete: vi.fn(),
    softDelete: vi.fn(),
  };
}

function createMockRunRepo() {
  return {
    create: vi.fn(),
    findById: vi.fn(),
    findByThreadId: vi.fn(),
    findByIds: vi.fn().mockResolvedValue([]),
    updateStatus: vi.fn(),
    updatePinnedConfig: vi.fn(),
    findRunningByPid: vi.fn(),
    list: vi.fn(),
    delete: vi.fn(),
  };
}

function createMockAgentExecutorFactory() {
  return {
    createExecutor: vi.fn(),
    getSupportedAgents: vi
      .fn()
      .mockReturnValue([AgentType.ClaudeCode, AgentType.CodexCli, AgentType.OpenRouter]),
    getCliInfo: vi.fn(),
    getSupportedModels: vi
      .fn()
      .mockImplementation((agentType: AgentType) =>
        agentType === AgentType.CodexCli ? ['gpt-5.4', 'gpt-5.4-mini'] : ['claude-sonnet-4-6']
      ),
    listAvailableModels: vi.fn().mockImplementation(async (agentType: AgentType) => {
      if (agentType === AgentType.CodexCli) {
        return [{ id: 'gpt-5.4' }, { id: 'gpt-5.4-mini' }];
      }
      if (agentType === AgentType.OpenRouter) {
        return [
          { id: 'anthropic/claude-sonnet-4.5' },
          { id: 'nvidia/nemotron-3-super-120b-a12b:free' },
        ];
      }
      return [{ id: 'claude-sonnet-4-6' }];
    }),
    createInteractiveExecutor: vi.fn(),
    supportsInteractive: vi.fn(),
  };
}

function createTestFeature(overrides?: Partial<Feature>): Feature {
  return {
    id: 'feat-001',
    name: 'Test feature',
    slug: 'test-feature',
    description: 'Test',
    userQuery: 'Ship the feature',
    repositoryPath: '/test/repo',
    branch: 'feat/test-feature',
    lifecycle: SdlcLifecycle.Requirements,
    messages: [],
    relatedArtifacts: [],
    buildMode: BuildMode.Application,
    fast: false,
    push: false,
    openPr: false,
    forkAndPr: false,
    commitSpecs: true,
    ciWatchEnabled: true,
    enableEvidence: false,
    commitEvidence: false,
    injectSkills: false,
    approvalGates: { allowPrd: false, allowPlan: false, allowMerge: false },
    agentRunId: 'run-001',
    specPath: '/test/repo/specs/001-test-feature',
    createdAt: new Date('2025-01-01T00:00:00Z'),
    updatedAt: new Date('2025-01-01T00:00:00Z'),
    ...overrides,
  };
}

function createTestRun(overrides?: Partial<AgentRun>): AgentRun {
  return {
    id: 'run-001',
    agentType: AgentType.ClaudeCode,
    agentName: 'feature-agent',
    status: AgentRunStatus.waitingApproval,
    prompt: 'Ship the feature',
    threadId: 'thread-001',
    featureId: 'feat-001',
    repositoryPath: '/test/repo',
    modelId: 'claude-sonnet-4-6',
    createdAt: new Date('2025-01-01T00:00:00Z'),
    updatedAt: new Date('2025-01-01T00:00:00Z'),
    ...overrides,
  };
}

describe('UpdateFeaturePinnedConfigUseCase', () => {
  let useCase: UpdateFeaturePinnedConfigUseCase;
  let featureRepo: ReturnType<typeof createMockFeatureRepo>;
  let runRepo: ReturnType<typeof createMockRunRepo>;
  let agentExecutorFactory: ReturnType<typeof createMockAgentExecutorFactory>;

  beforeEach(() => {
    featureRepo = createMockFeatureRepo();
    runRepo = createMockRunRepo();
    agentExecutorFactory = createMockAgentExecutorFactory();

    useCase = new UpdateFeaturePinnedConfigUseCase(
      featureRepo as any,
      runRepo as any,
      agentExecutorFactory as any
    );
  });

  it('throws when the feature is not found', async () => {
    featureRepo.findById.mockResolvedValue(null);

    await expect(
      useCase.execute({
        featureId: 'feat-missing',
        agentType: AgentType.CodexCli,
        modelId: 'gpt-5.4',
      })
    ).rejects.toThrow('Feature not found: feat-missing');

    expect(runRepo.findById).not.toHaveBeenCalled();
    expect(runRepo.updatePinnedConfig).not.toHaveBeenCalled();
  });

  it('throws when the feature has no current agent run reference', async () => {
    featureRepo.findById.mockResolvedValue(createTestFeature({ agentRunId: undefined }));

    await expect(
      useCase.execute({
        featureId: 'feat-001',
        agentType: AgentType.CodexCli,
        modelId: 'gpt-5.4',
      })
    ).rejects.toThrow('Feature "Test feature" has no current agent run');

    expect(runRepo.findById).not.toHaveBeenCalled();
    expect(runRepo.updatePinnedConfig).not.toHaveBeenCalled();
  });

  it('throws when the current agent run row does not exist', async () => {
    featureRepo.findById.mockResolvedValue(createTestFeature());
    runRepo.findById.mockResolvedValue(null);

    await expect(
      useCase.execute({
        featureId: 'feat-001',
        agentType: AgentType.CodexCli,
        modelId: 'gpt-5.4',
      })
    ).rejects.toThrow('Current agent run not found for feature "Test feature"');

    expect(runRepo.updatePinnedConfig).not.toHaveBeenCalled();
  });

  it('throws when the feature lifecycle and run status are not eligible for switching', async () => {
    featureRepo.findById.mockResolvedValue(createTestFeature({ lifecycle: SdlcLifecycle.Pending }));
    runRepo.findById.mockResolvedValue(createTestRun({ status: AgentRunStatus.running }));

    await expect(
      useCase.execute({
        featureId: 'feat-001',
        agentType: AgentType.CodexCli,
        modelId: 'gpt-5.4',
      })
    ).rejects.toThrow(
      'Feature "Test feature" cannot change pinned agent/model while lifecycle is "Pending" and run status is "running"'
    );

    expect(runRepo.updatePinnedConfig).not.toHaveBeenCalled();
  });

  it('throws when the agent type is unsupported', async () => {
    featureRepo.findById.mockResolvedValue(createTestFeature());
    runRepo.findById.mockResolvedValue(createTestRun());
    agentExecutorFactory.getSupportedAgents.mockReturnValue([AgentType.ClaudeCode]);

    await expect(
      useCase.execute({
        featureId: 'feat-001',
        agentType: AgentType.CodexCli,
        modelId: 'gpt-5.4',
      })
    ).rejects.toThrow('Unsupported agent type: codex-cli');

    expect(agentExecutorFactory.getSupportedAgents).toHaveBeenCalledOnce();
    expect(agentExecutorFactory.listAvailableModels).not.toHaveBeenCalled();
    expect(runRepo.updatePinnedConfig).not.toHaveBeenCalled();
  });

  it('throws when the model is unsupported for the requested agent', async () => {
    featureRepo.findById.mockResolvedValue(createTestFeature());
    runRepo.findById.mockResolvedValue(createTestRun());

    await expect(
      useCase.execute({
        featureId: 'feat-001',
        agentType: AgentType.CodexCli,
        modelId: 'claude-sonnet-4-6',
      })
    ).rejects.toThrow('Unsupported model "claude-sonnet-4-6" for agent "codex-cli"');

    expect(agentExecutorFactory.getSupportedAgents).toHaveBeenCalledOnce();
    expect(agentExecutorFactory.listAvailableModels).toHaveBeenCalledWith(AgentType.CodexCli);
    expect(runRepo.updatePinnedConfig).not.toHaveBeenCalled();
  });

  it('accepts a dynamically-listed openrouter model that is not in any static list', async () => {
    featureRepo.findById.mockResolvedValue(createTestFeature());
    runRepo.findById.mockResolvedValue(createTestRun());

    const result = await useCase.execute({
      featureId: 'feat-001',
      agentType: AgentType.OpenRouter,
      modelId: 'nvidia/nemotron-3-super-120b-a12b:free',
    });

    expect(agentExecutorFactory.listAvailableModels).toHaveBeenCalledWith(AgentType.OpenRouter);
    expect(runRepo.updatePinnedConfig).toHaveBeenCalledWith(
      'run-001',
      expect.objectContaining({
        agentType: AgentType.OpenRouter,
        modelId: 'nvidia/nemotron-3-super-120b-a12b:free',
      })
    );
    expect(result.modelId).toBe('nvidia/nemotron-3-super-120b-a12b:free');
  });

  it.each([
    {
      label: 'pending feature with pending run',
      feature: createTestFeature({ lifecycle: SdlcLifecycle.Pending }),
      run: createTestRun({ status: AgentRunStatus.pending }),
    },
    {
      label: 'waiting approval run',
      feature: createTestFeature({ lifecycle: SdlcLifecycle.Requirements }),
      run: createTestRun({ status: AgentRunStatus.waitingApproval }),
    },
    {
      label: 'failed run',
      feature: createTestFeature({ lifecycle: SdlcLifecycle.Implementation }),
      run: createTestRun({ status: AgentRunStatus.failed }),
    },
    {
      label: 'interrupted run',
      feature: createTestFeature({ lifecycle: SdlcLifecycle.Review }),
      run: createTestRun({ status: AgentRunStatus.interrupted }),
    },
  ])('accepts $label as an eligible continuation state', async ({ feature, run }) => {
    featureRepo.findById.mockResolvedValue(feature);
    runRepo.findById.mockResolvedValue(run);

    await useCase.execute({
      featureId: feature.id,
      agentType: AgentType.CodexCli,
      modelId: 'gpt-5.4',
    });

    expect(runRepo.updatePinnedConfig).toHaveBeenCalledOnce();
    vi.clearAllMocks();
  });

  it('updates only the current run, validates through the factory, and returns the saved config', async () => {
    featureRepo.findById.mockResolvedValue(createTestFeature());
    runRepo.findById.mockResolvedValue(createTestRun());

    const result = await useCase.execute({
      featureId: ' feat-001 ',
      agentRunId: 'forged-run-id',
      agentType: ' codex-cli ',
      modelId: ' gpt-5.4 ',
    } as any);

    expect(featureRepo.findById).toHaveBeenCalledWith('feat-001');
    expect(agentExecutorFactory.getSupportedAgents).toHaveBeenCalledOnce();
    expect(agentExecutorFactory.listAvailableModels).toHaveBeenCalledWith(AgentType.CodexCli);
    expect(runRepo.updatePinnedConfig).toHaveBeenCalledWith(
      'run-001',
      expect.objectContaining({
        agentType: AgentType.CodexCli,
        modelId: 'gpt-5.4',
        updatedAt: expect.any(Date),
      })
    );
    expect(featureRepo.update).not.toHaveBeenCalled();
    expect(result.featureId).toBe('feat-001');
    expect(result.agentRunId).toBe('run-001');
    expect(result.agentType).toBe(AgentType.CodexCli);
    expect(result.modelId).toBe('gpt-5.4');
    expect(result.updatedAt).toBeInstanceOf(Date);
  });
});
