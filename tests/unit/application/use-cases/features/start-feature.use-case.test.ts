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

vi.mock('@/infrastructure/services/settings.service.js', () => ({
  getSettings: vi.fn().mockReturnValue({
    agent: { type: 'claude-code' },
    security: { mode: 'Advisory' },
  }),
}));

import { StartFeatureUseCase } from '@/application/use-cases/features/start-feature.use-case.js';
import { SpawnFeatureAgentUseCase } from '@/application/use-cases/features/spawn-feature-agent.use-case.js';
import { SdlcLifecycle, AgentRunStatus, BuildMode } from '@/domain/generated/output.js';
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
    buildMode: BuildMode.Application,
    fast: false,
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

function createMockSyncFeatureBranch() {
  return {
    execute: vi.fn().mockResolvedValue({
      cwd: '/wt/feat-test',
      baseBranch: 'main',
      committed: false,
      conflictsResolved: false,
    }),
  };
}

describe('StartFeatureUseCase', () => {
  let useCase: StartFeatureUseCase;
  let featureRepo: ReturnType<typeof createMockFeatureRepo>;
  let runRepo: ReturnType<typeof createMockRunRepo>;
  let processService: ReturnType<typeof createMockProcessService>;
  let worktreeService: ReturnType<typeof createMockWorktreeService>;
  let syncFeatureBranch: ReturnType<typeof createMockSyncFeatureBranch>;
  let capacity: {
    hasCapacity: ReturnType<typeof vi.fn>;
    getQueuePosition: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    featureRepo = createMockFeatureRepo();
    runRepo = createMockRunRepo();
    processService = createMockProcessService();
    worktreeService = createMockWorktreeService();
    syncFeatureBranch = createMockSyncFeatureBranch();
    // The real spawner is wired to the mock process service, so the assertions
    // below still verify what actually reaches spawn() — now through the single
    // spawn path rather than a copy of it inside StartFeatureUseCase.
    const spawnFeatureAgent = new SpawnFeatureAgentUseCase(
      featureRepo as any,
      runRepo as any,
      processService as any,
      worktreeService as any,
      { load: vi.fn().mockResolvedValue({ security: { mode: 'Advisory' } }) } as any,
      syncFeatureBranch as any
    );
    capacity = {
      hasCapacity: vi.fn().mockResolvedValue(true),
      getQueuePosition: vi.fn().mockResolvedValue(1),
    };
    useCase = new StartFeatureUseCase(
      featureRepo as any,
      runRepo as any,
      spawnFeatureAgent,
      capacity as any
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
    featureRepo.findById.mockResolvedValue(createTestFeature({ fast: true }));
    runRepo.findById.mockResolvedValue(createTestRun());

    const result = await useCase.execute('feat-001');

    expect(result.feature.lifecycle).toBe(SdlcLifecycle.Implementation);
    expect(processService.spawn).toHaveBeenCalledOnce();
  });

  // -------------------------------------------------------------------------
  // Pending feature whose parent has not completed → Blocked, no spawn
  // -------------------------------------------------------------------------

  it('should transition to Blocked when the parent has not completed', async () => {
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

  it('should transition to Blocked when the parent is still implementing', async () => {
    const feature = createTestFeature({ parentId: 'parent-id' });
    const parent = createTestFeature({
      id: 'parent-id',
      lifecycle: SdlcLifecycle.Implementation,
    });
    featureRepo.findById.mockResolvedValueOnce(feature).mockResolvedValueOnce(parent);
    runRepo.findById.mockResolvedValue(createTestRun());

    const result = await useCase.execute('feat-001');

    expect(result.feature.lifecycle).toBe(SdlcLifecycle.Blocked);
    expect(processService.spawn).not.toHaveBeenCalled();
  });

  it('should transition to Blocked when the parent PR is open but not merged', async () => {
    const feature = createTestFeature({ parentId: 'parent-id' });
    const parent = createTestFeature({ id: 'parent-id', lifecycle: SdlcLifecycle.Review });
    featureRepo.findById.mockResolvedValueOnce(feature).mockResolvedValueOnce(parent);
    runRepo.findById.mockResolvedValue(createTestRun());

    const result = await useCase.execute('feat-001');

    expect(result.feature.lifecycle).toBe(SdlcLifecycle.Blocked);
    expect(processService.spawn).not.toHaveBeenCalled();
  });

  it('should report why the feature was blocked instead of started', async () => {
    const feature = createTestFeature({ parentId: 'parent-id' });
    const parent = createTestFeature({
      id: 'parent-id',
      name: 'Creator Studio',
      lifecycle: SdlcLifecycle.Implementation,
    });
    featureRepo.findById.mockResolvedValueOnce(feature).mockResolvedValueOnce(parent);
    runRepo.findById.mockResolvedValue(createTestRun());

    const result = await useCase.execute('feat-001');

    expect(result.blocked).toBe(true);
    expect(result.blockedBy).toEqual({
      id: 'parent-id',
      name: 'Creator Studio',
      lifecycle: SdlcLifecycle.Implementation,
    });
  });

  // -------------------------------------------------------------------------
  // Pending feature whose parent completed → Requirements, spawns
  // -------------------------------------------------------------------------

  it('should transition to Requirements when the parent has completed', async () => {
    const feature = createTestFeature({ parentId: 'parent-id' });
    const parent = createTestFeature({
      id: 'parent-id',
      lifecycle: SdlcLifecycle.Maintain,
    });
    featureRepo.findById.mockResolvedValueOnce(feature).mockResolvedValueOnce(parent);
    runRepo.findById.mockResolvedValue(createTestRun());

    const result = await useCase.execute('feat-001');

    expect(result.feature.lifecycle).toBe(SdlcLifecycle.Requirements);
    expect(result.blocked).toBe(false);
    expect(processService.spawn).toHaveBeenCalledOnce();
  });

  it('should sync the child onto its parent branch before spawning', async () => {
    const feature = createTestFeature({ parentId: 'parent-id' });
    const parent = createTestFeature({
      id: 'parent-id',
      lifecycle: SdlcLifecycle.Maintain,
      branch: 'feat/parent-feature',
    });
    featureRepo.findById.mockResolvedValueOnce(feature).mockResolvedValueOnce(parent);
    runRepo.findById.mockResolvedValue(createTestRun());

    await useCase.execute('feat-001');

    expect(syncFeatureBranch.execute).toHaveBeenCalledWith({
      repositoryPath: '/test/repo',
      branch: 'feat/test-feature',
      parentBranch: 'feat/parent-feature',
    });
  });

  it('should transition fast feature with satisfied parent to Implementation', async () => {
    const feature = createTestFeature({ parentId: 'parent-id', fast: true });
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
    featureRepo.findById.mockResolvedValue(createTestFeature({ fast: true }));
    runRepo.findById.mockResolvedValue(createTestRun());

    await useCase.execute('feat-001');

    expect(processService.spawn).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      expect.any(String),
      expect.any(String),
      expect.any(String),
      expect.objectContaining({ fast: true })
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
  // Security mode threading
  // -------------------------------------------------------------------------

  it('should pass securityMode from settings to spawn', async () => {
    featureRepo.findById.mockResolvedValue(createTestFeature());
    runRepo.findById.mockResolvedValue(createTestRun());

    await useCase.execute('feat-001');

    expect(processService.spawn).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      expect.any(String),
      expect.any(String),
      expect.any(String),
      expect.objectContaining({ securityMode: 'Advisory' })
    );
  });

  // -------------------------------------------------------------------------
  // Branch sync before spawn — commit work in progress, rebase onto base
  // -------------------------------------------------------------------------

  it('should commit and rebase the branch before spawning the agent', async () => {
    featureRepo.findById.mockResolvedValue(createTestFeature());
    runRepo.findById.mockResolvedValue(createTestRun());

    await useCase.execute('feat-001');

    expect(syncFeatureBranch.execute).toHaveBeenCalledWith({
      repositoryPath: '/test/repo',
      branch: 'feat/test-feature',
    });
    expect(syncFeatureBranch.execute.mock.invocationCallOrder[0]).toBeLessThan(
      processService.spawn.mock.invocationCallOrder[0]
    );
  });

  it('should still spawn the agent when the branch sync fails', async () => {
    featureRepo.findById.mockResolvedValue(createTestFeature());
    runRepo.findById.mockResolvedValue(createTestRun());
    syncFeatureBranch.execute.mockRejectedValue(new Error('no remote configured'));

    await expect(useCase.execute('feat-001')).resolves.toBeDefined();

    expect(processService.spawn).toHaveBeenCalled();
  });

  it('should not sync the branch when the feature is blocked by its parent', async () => {
    featureRepo.findById
      .mockResolvedValueOnce(createTestFeature({ parentId: 'parent-1' }))
      .mockResolvedValueOnce(
        createTestFeature({ id: 'parent-1', lifecycle: SdlcLifecycle.Blocked })
      );
    runRepo.findById.mockResolvedValue(createTestRun());

    await useCase.execute('feat-001');

    expect(syncFeatureBranch.execute).not.toHaveBeenCalled();
    expect(processService.spawn).not.toHaveBeenCalled();
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

  // -------------------------------------------------------------------------
  // Capacity gate
  // -------------------------------------------------------------------------

  describe('parallel-feature limit', () => {
    beforeEach(() => {
      featureRepo.findById.mockResolvedValue(createTestFeature());
      runRepo.findById.mockResolvedValue(createTestRun());
    });

    it('queues instead of spawning when no slot is free', async () => {
      capacity.hasCapacity.mockResolvedValue(false);
      capacity.getQueuePosition.mockResolvedValue(2);

      const result = await useCase.execute('feat-001');

      expect(result.queued).toBe(true);
      expect(result.queuePosition).toBe(2);
      expect(result.blocked).toBe(false);
      expect(processService.spawn).not.toHaveBeenCalled();
    });

    it('persists the queue marker so the drain can find it later', async () => {
      capacity.hasCapacity.mockResolvedValue(false);

      const result = await useCase.execute('feat-001');

      expect(result.feature.lifecycle).toBe(SdlcLifecycle.Pending);
      expect(result.feature.queuedAt).toBeInstanceOf(Date);
      expect(featureRepo.update).toHaveBeenCalledWith(
        expect.objectContaining({ queuedAt: expect.any(Date) })
      );
    });

    it('does not sync the branch when the feature is only queued', async () => {
      // The sync must happen at admission time, not queue time, or the feature
      // starts from a base that is stale by however long it waited.
      capacity.hasCapacity.mockResolvedValue(false);

      await useCase.execute('feat-001');

      expect(syncFeatureBranch.execute).not.toHaveBeenCalled();
    });

    it('reports not queued and spawns when a slot is free', async () => {
      capacity.hasCapacity.mockResolvedValue(true);

      const result = await useCase.execute('feat-001');

      expect(result.queued).toBe(false);
      expect(result.queuePosition).toBeUndefined();
      expect(processService.spawn).toHaveBeenCalledOnce();
    });

    it('does not evaluate capacity for a feature blocked by its parent', async () => {
      // A blocked feature cannot run anyway; queuing it would put it ahead of a
      // feature that could actually use the slot.
      capacity.hasCapacity.mockResolvedValue(false);
      featureRepo.findById
        .mockReset()
        .mockResolvedValueOnce(createTestFeature({ parentId: 'parent-1' }))
        .mockResolvedValueOnce(
          createTestFeature({ id: 'parent-1', lifecycle: SdlcLifecycle.Implementation })
        );

      const result = await useCase.execute('feat-001');

      expect(result.blocked).toBe(true);
      expect(result.queued).toBe(false);
      expect(result.feature.queuedAt).toBeUndefined();
      expect(capacity.hasCapacity).not.toHaveBeenCalled();
    });

    it('starts anyway when the caller explicitly bypasses the limit', async () => {
      capacity.hasCapacity.mockResolvedValue(false);

      const result = await useCase.execute('feat-001', { bypassCapacityLimit: true });

      expect(result.queued).toBe(false);
      expect(processService.spawn).toHaveBeenCalledOnce();
    });

    it('clears a previous queue marker when the feature is finally admitted', async () => {
      featureRepo.findById.mockResolvedValue(createTestFeature({ queuedAt: new Date() }));
      capacity.hasCapacity.mockResolvedValue(true);

      const result = await useCase.execute('feat-001');

      expect(result.feature.queuedAt).toBeUndefined();
    });
  });
});
