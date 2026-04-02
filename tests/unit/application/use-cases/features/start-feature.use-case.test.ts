/**
 * StartFeatureUseCase Unit Tests
 *
 * Tests for starting a pending feature: validate Pending lifecycle,
 * check parent gate, transition lifecycle, and spawn agent.
 *
 * TDD Phase: RED-GREEN-REFACTOR
 */

import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { StartFeatureUseCase } from '@/application/use-cases/features/start-feature.use-case.js';
import { SdlcLifecycle, AgentRunStatus, FeatureMode } from '@/domain/generated/output.js';
import type { Feature, AgentRun } from '@/domain/generated/output.js';

function createMockFeatureRepo() {
  return {
    create: vi.fn(),
    findById: vi.fn(),
    findByIdPrefix: vi.fn(),
    findBySlug: vi.fn(),
    list: vi.fn(),
    findByParentId: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    softDelete: vi.fn(),
  };
}

function createMockRunRepo() {
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
    isAlive: vi.fn(),
    checkAndMarkCrashed: vi.fn(),
  };
}

function createMockWorktreeService() {
  return {
    create: vi.fn(),
    remove: vi.fn(),
    list: vi.fn(),
    exists: vi.fn(),
    getWorktreePath: vi.fn().mockReturnValue('/wt/feat-test'),
  };
}

function createTestFeature(overrides?: Partial<Feature>): Feature {
  return {
    id: 'feat-001',
    name: 'Test feature',
    slug: 'test-feature',
    description: 'Test',
    userQuery: 'test user query',
    repositoryPath: '/test/repo',
    branch: 'feat/test-feature',
    lifecycle: SdlcLifecycle.Pending,
    messages: [],
    relatedArtifacts: [],
    mode: FeatureMode.Regular,
    iterationCount: 0,
    push: false,
    openPr: false,
    forkAndPr: false,
    commitSpecs: true,
    ciWatchEnabled: true,
    enableEvidence: false,
    injectSkills: false,
    commitEvidence: false,
    approvalGates: { allowPrd: false, allowPlan: false, allowMerge: false },
    agentRunId: 'run-001',
    specPath: '/wt/feat-test/specs/001-test-feature',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function createTestRun(overrides?: Partial<AgentRun>): AgentRun {
  return {
    id: 'run-001',
    agentType: 'claude-code' as any,
    agentName: 'feature-agent',
    status: AgentRunStatus.pending,
    prompt: 'Test',
    threadId: 'thread-001',
    featureId: 'feat-001',
    repositoryPath: '/test/repo',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('StartFeatureUseCase', () => {
  let useCase: StartFeatureUseCase;
  let featureRepo: ReturnType<typeof createMockFeatureRepo>;
  let runRepo: ReturnType<typeof createMockRunRepo>;
  let processService: ReturnType<typeof createMockProcessService>;
  let worktreeService: ReturnType<typeof createMockWorktreeService>;

  beforeEach(() => {
    featureRepo = createMockFeatureRepo();
    runRepo = createMockRunRepo();
    processService = createMockProcessService();
    worktreeService = createMockWorktreeService();
    useCase = new StartFeatureUseCase(
      featureRepo as any,
      runRepo as any,
      processService as any,
      worktreeService as any
    );
  });

  // -------------------------------------------------------------------------
  // Feature not found
  // -------------------------------------------------------------------------

  it('should throw when feature is not found', async () => {
    featureRepo.findById.mockResolvedValue(null);
    featureRepo.findByIdPrefix.mockResolvedValue(null);

    await expect(useCase.execute('nonexistent')).rejects.toThrow(/not found/i);
  });

  it('should resolve feature by ID prefix', async () => {
    featureRepo.findById.mockResolvedValue(null);
    featureRepo.findByIdPrefix.mockResolvedValue(createTestFeature());
    runRepo.findById.mockResolvedValue(createTestRun());

    const result = await useCase.execute('feat-0');

    expect(result.feature.id).toBe('feat-001');
    expect(featureRepo.findByIdPrefix).toHaveBeenCalledWith('feat-0');
  });

  // -------------------------------------------------------------------------
  // Lifecycle validation
  // -------------------------------------------------------------------------

  it('should throw when feature lifecycle is not Pending', async () => {
    featureRepo.findById.mockResolvedValue(
      createTestFeature({ lifecycle: SdlcLifecycle.Requirements })
    );

    await expect(useCase.execute('feat-001')).rejects.toThrow(/not in Pending state/i);
  });

  it('should throw descriptive error for non-Pending lifecycle', async () => {
    featureRepo.findById.mockResolvedValue(
      createTestFeature({ lifecycle: SdlcLifecycle.Implementation })
    );

    await expect(useCase.execute('feat-001')).rejects.toThrow(
      'Feature "Test feature" is not in Pending state (current: Implementation). Only pending features can be started.'
    );
  });

  // -------------------------------------------------------------------------
  // Pending feature with no parent → transitions to Requirements, spawns agent
  // -------------------------------------------------------------------------

  it('should transition Pending feature to Requirements and spawn agent', async () => {
    featureRepo.findById.mockResolvedValue(createTestFeature());
    runRepo.findById.mockResolvedValue(createTestRun());

    const result = await useCase.execute('feat-001');

    expect(result.feature.lifecycle).toBe(SdlcLifecycle.Requirements);
    expect(featureRepo.update).toHaveBeenCalledWith(
      expect.objectContaining({ lifecycle: SdlcLifecycle.Requirements })
    );
    expect(processService.spawn).toHaveBeenCalledOnce();
  });

  // -------------------------------------------------------------------------
  // Fast feature → transitions to Implementation
  // -------------------------------------------------------------------------

  it('should transition fast Pending feature to Implementation', async () => {
    featureRepo.findById.mockResolvedValue(createTestFeature({ mode: FeatureMode.Fast }));
    runRepo.findById.mockResolvedValue(createTestRun());

    const result = await useCase.execute('feat-001');

    expect(result.feature.lifecycle).toBe(SdlcLifecycle.Implementation);
    expect(processService.spawn).toHaveBeenCalledOnce();
  });

  // -------------------------------------------------------------------------
  // Pending feature with parent not in POST_IMPLEMENTATION → Blocked, no spawn
  // -------------------------------------------------------------------------

  it('should transition to Blocked when parent not in POST_IMPLEMENTATION', async () => {
    const feature = createTestFeature({ parentId: 'parent-id' });
    const parent = createTestFeature({
      id: 'parent-id',
      lifecycle: SdlcLifecycle.Requirements,
    });
    featureRepo.findById
      .mockResolvedValueOnce(feature) // find the feature
      .mockResolvedValueOnce(parent); // find the parent
    runRepo.findById.mockResolvedValue(createTestRun());

    const result = await useCase.execute('feat-001');

    expect(result.feature.lifecycle).toBe(SdlcLifecycle.Blocked);
    expect(processService.spawn).not.toHaveBeenCalled();
  });

  it('should transition to Blocked when parent is Blocked', async () => {
    const feature = createTestFeature({ parentId: 'parent-id' });
    const parent = createTestFeature({
      id: 'parent-id',
      lifecycle: SdlcLifecycle.Blocked,
    });
    featureRepo.findById.mockResolvedValueOnce(feature).mockResolvedValueOnce(parent);
    runRepo.findById.mockResolvedValue(createTestRun());

    const result = await useCase.execute('feat-001');

    expect(result.feature.lifecycle).toBe(SdlcLifecycle.Blocked);
    expect(processService.spawn).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Pending feature with parent in POST_IMPLEMENTATION → Requirements, spawns
  // -------------------------------------------------------------------------

  it('should transition to Requirements when parent is in POST_IMPLEMENTATION', async () => {
    const feature = createTestFeature({ parentId: 'parent-id' });
    const parent = createTestFeature({
      id: 'parent-id',
      lifecycle: SdlcLifecycle.Implementation,
    });
    featureRepo.findById.mockResolvedValueOnce(feature).mockResolvedValueOnce(parent);
    runRepo.findById.mockResolvedValue(createTestRun());

    const result = await useCase.execute('feat-001');

    expect(result.feature.lifecycle).toBe(SdlcLifecycle.Requirements);
    expect(processService.spawn).toHaveBeenCalledOnce();
  });

  it('should transition fast feature with satisfied parent to Implementation', async () => {
    const feature = createTestFeature({ parentId: 'parent-id', mode: FeatureMode.Fast });
    const parent = createTestFeature({
      id: 'parent-id',
      lifecycle: SdlcLifecycle.Maintain,
    });
    featureRepo.findById.mockResolvedValueOnce(feature).mockResolvedValueOnce(parent);
    runRepo.findById.mockResolvedValue(createTestRun());

    const result = await useCase.execute('feat-001');

    expect(result.feature.lifecycle).toBe(SdlcLifecycle.Implementation);
    expect(processService.spawn).toHaveBeenCalledOnce();
  });

  // -------------------------------------------------------------------------
  // Missing agentRunId
  // -------------------------------------------------------------------------

  it('should throw when feature has no agentRunId', async () => {
    featureRepo.findById.mockResolvedValue(createTestFeature({ agentRunId: undefined }));

    await expect(useCase.execute('feat-001')).rejects.toThrow(/no agent run/i);
  });

  it('should throw when agentRun record not found in repository', async () => {
    featureRepo.findById.mockResolvedValue(createTestFeature());
    runRepo.findById.mockResolvedValue(null);

    await expect(useCase.execute('feat-001')).rejects.toThrow(/no agent run/i);
  });

  // -------------------------------------------------------------------------
  // Missing specPath — wait for initialization
  // -------------------------------------------------------------------------

  it('should throw when feature is missing specPath after retries', async () => {
    vi.useFakeTimers();
    featureRepo.findById.mockResolvedValue(createTestFeature({ specPath: undefined }));
    runRepo.findById.mockResolvedValue(createTestRun());

    let caughtError: Error | undefined;
    const promise = useCase.execute('feat-001').catch((e: Error) => {
      caughtError = e;
    });
    // Advance past all 20 polling intervals (20 * 500ms = 10000ms)
    await vi.advanceTimersByTimeAsync(10_000);
    await promise;

    expect(caughtError?.message).toMatch(/still being initialized/i);
    vi.useRealTimers();
  });

  it('should wait and succeed when specPath becomes available after initialization', async () => {
    vi.useFakeTimers();
    const featureWithoutSpec = createTestFeature({ specPath: '' });
    const featureWithSpec = createTestFeature({ specPath: '/wt/feat-test/specs/001-test-feature' });

    // First call returns feature without specPath (from initial lookup),
    // second poll finds specPath populated
    featureRepo.findById
      .mockResolvedValueOnce(featureWithoutSpec) // initial lookup
      .mockResolvedValueOnce(featureWithSpec); // poll retry finds specPath populated
    runRepo.findById.mockResolvedValue(createTestRun());

    const promise = useCase.execute('feat-001');
    await vi.advanceTimersByTimeAsync(500);

    const result = await promise;

    expect(result.feature.lifecycle).toBe(SdlcLifecycle.Requirements);
    expect(processService.spawn).toHaveBeenCalledOnce();
    vi.useRealTimers();
  });

  // -------------------------------------------------------------------------
  // Spawn arguments
  // -------------------------------------------------------------------------

  it('should spawn agent with correct arguments', async () => {
    featureRepo.findById.mockResolvedValue(createTestFeature());
    runRepo.findById.mockResolvedValue(createTestRun());

    await useCase.execute('feat-001');

    expect(processService.spawn).toHaveBeenCalledWith(
      'feat-001',
      'run-001',
      '/test/repo',
      '/wt/feat-test/specs/001-test-feature',
      '/wt/feat-test',
      expect.objectContaining({
        threadId: 'thread-001',
        push: false,
        openPr: false,
      })
    );
  });

  it('should pass fast flag to spawn when feature is fast', async () => {
    featureRepo.findById.mockResolvedValue(createTestFeature({ mode: FeatureMode.Fast }));
    runRepo.findById.mockResolvedValue(createTestRun());

    await useCase.execute('feat-001');

    expect(processService.spawn).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      expect.any(String),
      expect.any(String),
      expect.any(String),
      expect.objectContaining({ mode: FeatureMode.Fast })
    );
  });

  it('should spawn using the current run agentType and modelId after a config switch', async () => {
    featureRepo.findById.mockResolvedValue(createTestFeature());
    runRepo.findById.mockResolvedValue(
      createTestRun({
        agentType: 'codex-cli' as any,
        modelId: 'gpt-5.4',
        threadId: 'thread-switched',
      })
    );

    await useCase.execute('feat-001');

    expect(processService.spawn).toHaveBeenCalledWith(
      'feat-001',
      'run-001',
      '/test/repo',
      '/wt/feat-test/specs/001-test-feature',
      '/wt/feat-test',
      expect.objectContaining({
        threadId: 'thread-switched',
        agentType: 'codex-cli',
        model: 'gpt-5.4',
      })
    );
  });

  it('should pass model from agentRun to spawn', async () => {
    featureRepo.findById.mockResolvedValue(createTestFeature());
    runRepo.findById.mockResolvedValue(createTestRun({ modelId: 'claude-opus-4-6' }));

    await useCase.execute('feat-001');

    expect(processService.spawn).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      expect.any(String),
      expect.any(String),
      expect.any(String),
      expect.objectContaining({ model: 'claude-opus-4-6' })
    );
  });

  it('should pass agentType from agentRun to spawn', async () => {
    featureRepo.findById.mockResolvedValue(createTestFeature());
    runRepo.findById.mockResolvedValue(createTestRun({ agentType: 'dev' as any }));

    await useCase.execute('feat-001');

    expect(processService.spawn).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      expect.any(String),
      expect.any(String),
      expect.any(String),
      expect.objectContaining({ agentType: 'dev' })
    );
  });

  // -------------------------------------------------------------------------
  // Return value
  // -------------------------------------------------------------------------

  it('should return updated feature and agentRun', async () => {
    const agentRun = createTestRun();
    featureRepo.findById.mockResolvedValue(createTestFeature());
    runRepo.findById.mockResolvedValue(agentRun);

    const result = await useCase.execute('feat-001');

    expect(result.feature).toBeDefined();
    expect(result.agentRun).toBeDefined();
    expect(result.agentRun.id).toBe('run-001');
  });
});
