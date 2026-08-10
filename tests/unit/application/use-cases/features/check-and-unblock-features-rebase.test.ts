/**
 * CheckAndUnblockFeaturesUseCase — Auto-Sync Tests
 *
 * Tests the sync orchestration that runs between lifecycle transition
 * (Blocked → Started) and agent spawn. Each unblocked child is brought in sync
 * with the work it depends on before its agent spawns.
 *
 * The git mechanics themselves — committing work in progress, choosing between
 * the base branch and the parent branch, conflict resolution — belong to
 * SyncFeatureBranchUseCase and are covered by its own tests. What this suite
 * owns is the orchestration around it: delegation with the right inputs,
 * activity-timeline records, per-child failure isolation, and the guarantee
 * that the agent spawns regardless of the sync outcome.
 *
 * TDD Phase: RED-GREEN-REFACTOR
 */

import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CheckAndUnblockFeaturesUseCase } from '@/application/use-cases/features/check-and-unblock-features.use-case.js';
import type { SyncFeatureBranchUseCase } from '@/application/use-cases/features/sync-feature-branch.use-case.js';
import type { IFeatureRepository } from '@/application/ports/output/repositories/feature-repository.interface.js';
import type { IFeatureAgentProcessService } from '@/application/ports/output/agents/feature-agent-process.interface.js';
import {
  GitPrError,
  GitPrErrorCode,
} from '@/application/ports/output/services/git-pr-service.interface.js';
import type { IWorktreeService } from '@/application/ports/output/services/worktree-service.interface.js';
import type { IAgentRunRepository } from '@/application/ports/output/agents/agent-run-repository.interface.js';
import type { IPhaseTimingRepository } from '@/application/ports/output/agents/phase-timing-repository.interface.js';
import { SdlcLifecycle, AgentRunStatus } from '@/domain/generated/output.js';
import type { Feature } from '@/domain/generated/output.js';
import { SpawnFeatureAgentUseCase } from '@/application/use-cases/features/spawn-feature-agent.use-case.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeFeature(overrides?: Partial<Feature>): Feature {
  return {
    id: 'feat-001',
    name: 'Test Feature',
    slug: 'test-feature',
    description: 'A test feature',
    userQuery: 'test query',
    repositoryPath: '/repo',
    branch: 'feat/test-feature',
    lifecycle: SdlcLifecycle.Maintain,
    messages: [],
    relatedArtifacts: [],
    buildMode: 'application' as Feature['buildMode'],
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
    specPath: '/repo/.shep/specs/001-test-feature',
    worktreePath: '/worktrees/test-feature',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Mock factories
// ---------------------------------------------------------------------------

function createMockFeatureRepo(): IFeatureRepository {
  return {
    create: vi.fn(),
    findById: vi.fn().mockResolvedValue(null),
    findByIdPrefix: vi.fn().mockResolvedValue(null),
    findBySlug: vi.fn().mockResolvedValue(null),
    findByBranch: vi.fn().mockResolvedValue(null),
    list: vi.fn().mockResolvedValue([]),
    findByParentId: vi.fn().mockResolvedValue([]),
    update: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn(),
    softDelete: vi.fn(),
  } as unknown as IFeatureRepository;
}

function createMockAgentProcess(): IFeatureAgentProcessService {
  return {
    spawn: vi.fn().mockReturnValue(1234),
    isAlive: vi.fn(),
    checkAndMarkCrashed: vi.fn(),
  };
}

function createMockSyncFeatureBranch(): SyncFeatureBranchUseCase {
  return {
    execute: vi.fn().mockResolvedValue({
      cwd: '/repo',
      baseBranch: 'main',
      rebasedOnto: 'main',
      committed: false,
      conflictsResolved: false,
    }),
  } as unknown as SyncFeatureBranchUseCase;
}

function createMockWorktreeService(): IWorktreeService {
  return {
    create: vi.fn(),
    addExisting: vi.fn(),
    remove: vi.fn(),
    list: vi.fn(),
    exists: vi.fn().mockResolvedValue(false),
    branchExists: vi.fn(),
    remoteBranchExists: vi.fn(),
    getWorktreePath: vi.fn().mockReturnValue('/repo/.worktrees/feat-x'),
    listBranches: vi.fn(),
    prune: vi.fn(),
    ensureGitRepository: vi.fn(),
  } as unknown as IWorktreeService;
}

function createMockAgentRunRepo(): IAgentRunRepository {
  return {
    create: vi.fn().mockResolvedValue(undefined),
    // A real feature always has its AgentRun — it carries the agent identity the
    // spawn path reads (type, model, thread).
    findById: vi.fn().mockResolvedValue({
      id: 'run-001',
      agentType: 'claude-code',
      agentName: 'feature-agent',
      status: 'pending',
      prompt: 'test',
      threadId: 'thread-001',
      featureId: 'feat-001',
      repositoryPath: '/repo',
      createdAt: new Date(),
      updatedAt: new Date(),
    }),
    findByThreadId: vi.fn(),
    updateStatus: vi.fn().mockResolvedValue(undefined),
    updatePinnedConfig: vi.fn(),
    findRunningByPid: vi.fn(),
    list: vi.fn(),
    delete: vi.fn(),
  } as unknown as IAgentRunRepository;
}

function createMockPhaseTimingRepo(): IPhaseTimingRepository {
  return {
    save: vi.fn().mockResolvedValue(undefined),
    update: vi.fn().mockResolvedValue(undefined),
    updateApprovalWait: vi.fn(),
    findByRunId: vi.fn(),
    findByFeatureId: vi.fn(),
  } as unknown as IPhaseTimingRepository;
}

// ---------------------------------------------------------------------------
// Test Suite
// ---------------------------------------------------------------------------

describe('CheckAndUnblockFeaturesUseCase — Auto-Sync', () => {
  let useCase: CheckAndUnblockFeaturesUseCase;
  let mockFeatureRepo: IFeatureRepository;
  let mockAgentProcess: IFeatureAgentProcessService;
  let mockSyncFeatureBranch: SyncFeatureBranchUseCase;
  let mockWorktreeService: IWorktreeService;
  let mockAgentRunRepo: IAgentRunRepository;
  let mockPhaseTimingRepo: IPhaseTimingRepository;

  const parentId = 'parent-001';

  beforeEach(() => {
    vi.clearAllMocks();
    mockFeatureRepo = createMockFeatureRepo();
    mockAgentProcess = createMockAgentProcess();
    mockSyncFeatureBranch = createMockSyncFeatureBranch();
    mockWorktreeService = createMockWorktreeService();
    mockAgentRunRepo = createMockAgentRunRepo();
    mockPhaseTimingRepo = createMockPhaseTimingRepo();

    useCase = new CheckAndUnblockFeaturesUseCase(
      mockFeatureRepo,
      mockSyncFeatureBranch,
      mockAgentRunRepo,
      mockPhaseTimingRepo,
      new SpawnFeatureAgentUseCase(
        mockFeatureRepo,
        mockAgentRunRepo,
        mockAgentProcess,
        mockWorktreeService,
        { load: vi.fn().mockResolvedValue(null) } as any,
        mockSyncFeatureBranch
      ) as any,
      { hasCapacity: vi.fn().mockResolvedValue(true), getQueuePosition: vi.fn() } as any
    );
  });

  // -------------------------------------------------------------------------
  // Delegation — happy path
  // -------------------------------------------------------------------------

  it('should sync the child against its parent branch before spawning the agent', async () => {
    const parent = makeFeature({ id: parentId, branch: 'feat/parent-feature' });
    const child = makeFeature({
      id: 'child-001',
      lifecycle: SdlcLifecycle.Blocked,
      branch: 'feat/child-feature',
      repositoryPath: '/repo',
    });
    vi.mocked(mockFeatureRepo.findById).mockResolvedValue(parent);
    vi.mocked(mockFeatureRepo.findByParentId).mockResolvedValue([child]);

    await useCase.execute(parentId);

    expect(mockSyncFeatureBranch.execute).toHaveBeenCalledWith({
      repositoryPath: '/repo',
      branch: 'feat/child-feature',
      parentBranch: 'feat/parent-feature',
    });
    expect(vi.mocked(mockSyncFeatureBranch.execute).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(mockAgentProcess.spawn).mock.invocationCallOrder[0]
    );
    expect(mockAgentProcess.spawn).toHaveBeenCalledOnce();
  });

  it('should never stash — the shared sync commits work in progress instead', async () => {
    // `git stash push` ignores untracked files, so a worktree holding only new
    // files stays dirty and the rebase aborts. The sync use case commits.
    const parent = makeFeature({ id: parentId, branch: 'feat/parent' });
    const child = makeFeature({ id: 'child-001', lifecycle: SdlcLifecycle.Blocked });
    vi.mocked(mockFeatureRepo.findById).mockResolvedValue(parent);
    vi.mocked(mockFeatureRepo.findByParentId).mockResolvedValue([child]);

    await useCase.execute(parentId);

    expect(useCase).not.toHaveProperty('gitPrService');
    expect(mockSyncFeatureBranch.execute).toHaveBeenCalledOnce();
  });

  // -------------------------------------------------------------------------
  // Agent run and phase timing creation
  // -------------------------------------------------------------------------

  it('should create agent run and phase timing for the sync operation', async () => {
    const parent = makeFeature({ id: parentId, branch: 'feat/parent' });
    const child = makeFeature({
      id: 'child-001',
      lifecycle: SdlcLifecycle.Blocked,
      branch: 'feat/child',
    });
    vi.mocked(mockFeatureRepo.findById).mockResolvedValue(parent);
    vi.mocked(mockFeatureRepo.findByParentId).mockResolvedValue([child]);

    await useCase.execute(parentId);

    expect(mockAgentRunRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        featureId: 'child-001',
        status: AgentRunStatus.running,
        prompt: expect.stringContaining('feat/parent'),
      })
    );

    expect(mockPhaseTimingRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ phase: 'rebase-on-parent' })
    );

    expect(mockPhaseTimingRepo.update).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ exitCode: 'success' })
    );

    expect(mockAgentRunRepo.updateStatus).toHaveBeenCalledWith(
      expect.any(String),
      AgentRunStatus.completed,
      expect.objectContaining({ completedAt: expect.any(String) })
    );
  });

  // -------------------------------------------------------------------------
  // Sync failure — agent still spawns
  // -------------------------------------------------------------------------

  it('should still spawn the agent when the sync fails', async () => {
    const parent = makeFeature({ id: parentId, branch: 'feat/parent' });
    const child = makeFeature({ id: 'child-001', lifecycle: SdlcLifecycle.Blocked });
    vi.mocked(mockFeatureRepo.findById).mockResolvedValue(parent);
    vi.mocked(mockFeatureRepo.findByParentId).mockResolvedValue([child]);
    vi.mocked(mockSyncFeatureBranch.execute).mockRejectedValue(
      new GitPrError('Unexpected git failure', GitPrErrorCode.GIT_ERROR)
    );

    await useCase.execute(parentId);

    expect(mockAgentProcess.spawn).toHaveBeenCalledOnce();
  });

  it('should record a sync failure in the phase timing', async () => {
    const parent = makeFeature({ id: parentId, branch: 'feat/parent' });
    const child = makeFeature({ id: 'child-001', lifecycle: SdlcLifecycle.Blocked });
    vi.mocked(mockFeatureRepo.findById).mockResolvedValue(parent);
    vi.mocked(mockFeatureRepo.findByParentId).mockResolvedValue([child]);
    vi.mocked(mockSyncFeatureBranch.execute).mockRejectedValue(
      new GitPrError('Unexpected git failure', GitPrErrorCode.GIT_ERROR)
    );

    await useCase.execute(parentId);

    expect(mockPhaseTimingRepo.update).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        exitCode: 'error',
        errorMessage: expect.stringContaining('Unexpected git failure'),
      })
    );

    expect(mockAgentRunRepo.updateStatus).toHaveBeenCalledWith(
      expect.any(String),
      AgentRunStatus.failed,
      expect.objectContaining({ error: expect.stringContaining('Unexpected git failure') })
    );
  });

  // -------------------------------------------------------------------------
  // Per-child isolation
  // -------------------------------------------------------------------------

  it('should still sync and spawn the second child when the first sync fails', async () => {
    const parent = makeFeature({ id: parentId, branch: 'feat/parent' });
    const child1 = makeFeature({
      id: 'child-001',
      lifecycle: SdlcLifecycle.Blocked,
      branch: 'feat/child-1',
      agentRunId: 'run-1',
    });
    const child2 = makeFeature({
      id: 'child-002',
      lifecycle: SdlcLifecycle.Blocked,
      branch: 'feat/child-2',
      agentRunId: 'run-2',
    });
    vi.mocked(mockFeatureRepo.findById).mockResolvedValue(parent);
    vi.mocked(mockFeatureRepo.findByParentId).mockResolvedValue([child1, child2]);
    vi.mocked(mockSyncFeatureBranch.execute)
      .mockRejectedValueOnce(new GitPrError('boom', GitPrErrorCode.GIT_ERROR))
      .mockResolvedValueOnce({
        cwd: '/repo',
        baseBranch: 'main',
        rebasedOnto: 'main',
        committed: false,
        conflictsResolved: false,
      });

    await useCase.execute(parentId);

    expect(mockSyncFeatureBranch.execute).toHaveBeenCalledTimes(2);
    expect(mockAgentProcess.spawn).toHaveBeenCalledTimes(2);
  });

  // -------------------------------------------------------------------------
  // NFR-3 — never rebase under a running agent
  // -------------------------------------------------------------------------

  it('should skip the sync when the child has an active (running) agent run', async () => {
    const parent = makeFeature({ id: parentId, branch: 'feat/parent' });
    const child = makeFeature({
      id: 'child-001',
      lifecycle: SdlcLifecycle.Blocked,
      agentRunId: 'run-active',
    });
    vi.mocked(mockFeatureRepo.findById).mockResolvedValue(parent);
    vi.mocked(mockFeatureRepo.findByParentId).mockResolvedValue([child]);
    vi.mocked(mockAgentRunRepo.findById).mockResolvedValue({
      id: 'run-active',
      status: AgentRunStatus.running,
    } as never);

    await useCase.execute(parentId);

    expect(mockSyncFeatureBranch.execute).not.toHaveBeenCalled();
    expect(mockAgentProcess.spawn).toHaveBeenCalledOnce();
  });

  it('should sync when the child agent run is not running (completed)', async () => {
    const parent = makeFeature({ id: parentId, branch: 'feat/parent' });
    const child = makeFeature({
      id: 'child-001',
      lifecycle: SdlcLifecycle.Blocked,
      agentRunId: 'run-done',
    });
    vi.mocked(mockFeatureRepo.findById).mockResolvedValue(parent);
    vi.mocked(mockFeatureRepo.findByParentId).mockResolvedValue([child]);
    vi.mocked(mockAgentRunRepo.findById).mockResolvedValue({
      id: 'run-done',
      status: AgentRunStatus.completed,
    } as never);

    await useCase.execute(parentId);

    expect(mockSyncFeatureBranch.execute).toHaveBeenCalledOnce();
  });

  it('should sync when the child has no agent run ID', async () => {
    const parent = makeFeature({ id: parentId, branch: 'feat/parent' });
    const child = makeFeature({
      id: 'child-001',
      lifecycle: SdlcLifecycle.Blocked,
      agentRunId: undefined,
    });
    vi.mocked(mockFeatureRepo.findById).mockResolvedValue(parent);
    vi.mocked(mockFeatureRepo.findByParentId).mockResolvedValue([child]);

    await useCase.execute(parentId);

    expect(mockSyncFeatureBranch.execute).toHaveBeenCalledOnce();
  });

  // -------------------------------------------------------------------------
  // Non-blocked children are untouched
  // -------------------------------------------------------------------------

  it('should not sync non-blocked children', async () => {
    const parent = makeFeature({ id: parentId, branch: 'feat/parent' });
    const startedChild = makeFeature({ id: 'child-001', lifecycle: SdlcLifecycle.Started });
    vi.mocked(mockFeatureRepo.findById).mockResolvedValue(parent);
    vi.mocked(mockFeatureRepo.findByParentId).mockResolvedValue([startedChild]);

    await useCase.execute(parentId);

    expect(mockSyncFeatureBranch.execute).not.toHaveBeenCalled();
    expect(mockAgentProcess.spawn).not.toHaveBeenCalled();
  });
});
