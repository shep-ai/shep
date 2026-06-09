/**
 * CheckAndUnblockFeaturesUseCase — Auto-Rebase Tests
 *
 * Tests the rebase orchestration that runs between lifecycle transition
 * (Blocked → Started) and agent spawn. Each blocked child's branch is
 * rebased onto the parent's branch before the agent spawns.
 *
 * TDD Phase: RED-GREEN-REFACTOR
 */

import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CheckAndUnblockFeaturesUseCase } from '@/application/use-cases/features/check-and-unblock-features.use-case.js';
import type { IFeatureRepository } from '@/application/ports/output/repositories/feature-repository.interface.js';
import type { IFeatureAgentProcessService } from '@/application/ports/output/agents/feature-agent-process.interface.js';
import type { IGitPrService } from '@/application/ports/output/services/git-pr-service.interface.js';
import {
  GitPrError,
  GitPrErrorCode,
} from '@/application/ports/output/services/git-pr-service.interface.js';
import type { IWorktreeService } from '@/application/ports/output/services/worktree-service.interface.js';
import type { ConflictResolutionService } from '@/infrastructure/services/agents/conflict-resolution/conflict-resolution.service.js';
import type { IAgentRunRepository } from '@/application/ports/output/agents/agent-run-repository.interface.js';
import type { IPhaseTimingRepository } from '@/application/ports/output/agents/phase-timing-repository.interface.js';
import { SdlcLifecycle, AgentRunStatus } from '@/domain/generated/output.js';
import type { Feature } from '@/domain/generated/output.js';

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
    lifecycle: SdlcLifecycle.Implementation,
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

function createMockGitPrService(): IGitPrService {
  return {
    getDefaultBranch: vi.fn().mockResolvedValue('main'),
    syncMain: vi.fn().mockResolvedValue(undefined),
    rebaseOnMain: vi.fn().mockResolvedValue(undefined),
    rebaseOnBranch: vi.fn().mockResolvedValue(undefined),
    hasUncommittedChanges: vi.fn(),
    hasRemote: vi.fn(),
    getRemoteUrl: vi.fn(),
    push: vi.fn(),
    createPr: vi.fn(),
    mergePr: vi.fn(),
    mergeBranch: vi.fn(),
    localMergeSquash: vi.fn(),
    getCiStatus: vi.fn(),
    watchCi: vi.fn(),
    deleteBranch: vi.fn(),
    getPrDiffSummary: vi.fn(),
    getFileDiffs: vi.fn(),
    listPrStatuses: vi.fn(),
    getMergeableStatus: vi.fn(),
    verifyMerge: vi.fn(),
    revParse: vi.fn(),
    commitAll: vi.fn(),
    getFailureLogs: vi.fn(),
    getConflictedFiles: vi.fn(),
    stageFiles: vi.fn(),
    rebaseContinue: vi.fn(),
    rebaseAbort: vi.fn(),
    stash: vi.fn().mockResolvedValue(false),
    stashPop: vi.fn().mockResolvedValue(undefined),
    getBranchSyncStatus: vi.fn(),
  } as unknown as IGitPrService;
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

function createMockConflictResolution(): ConflictResolutionService {
  return {
    resolve: vi.fn().mockResolvedValue(undefined),
  } as unknown as ConflictResolutionService;
}

function createMockAgentRunRepo(): IAgentRunRepository {
  return {
    create: vi.fn().mockResolvedValue(undefined),
    findById: vi.fn().mockResolvedValue(null),
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

describe('CheckAndUnblockFeaturesUseCase — Auto-Rebase', () => {
  let useCase: CheckAndUnblockFeaturesUseCase;
  let mockFeatureRepo: IFeatureRepository;
  let mockAgentProcess: IFeatureAgentProcessService;
  let mockGitPrService: IGitPrService;
  let mockWorktreeService: IWorktreeService;
  let mockConflictResolution: ConflictResolutionService;
  let mockAgentRunRepo: IAgentRunRepository;
  let mockPhaseTimingRepo: IPhaseTimingRepository;

  const parentId = 'parent-001';

  beforeEach(() => {
    vi.clearAllMocks();
    mockFeatureRepo = createMockFeatureRepo();
    mockAgentProcess = createMockAgentProcess();
    mockGitPrService = createMockGitPrService();
    mockWorktreeService = createMockWorktreeService();
    mockConflictResolution = createMockConflictResolution();
    mockAgentRunRepo = createMockAgentRunRepo();
    mockPhaseTimingRepo = createMockPhaseTimingRepo();

    useCase = new CheckAndUnblockFeaturesUseCase(
      mockFeatureRepo,
      mockAgentProcess,
      { load: vi.fn().mockResolvedValue(null) } as any,
      mockGitPrService,
      mockWorktreeService,
      mockConflictResolution,
      mockAgentRunRepo,
      mockPhaseTimingRepo
    );
  });

  // -------------------------------------------------------------------------
  // Successful rebase — happy path
  // -------------------------------------------------------------------------

  it('should rebase child branch onto parent branch before spawning agent', async () => {
    const parent = makeFeature({
      id: parentId,
      lifecycle: SdlcLifecycle.Implementation,
      branch: 'feat/parent-feature',
    });
    const child = makeFeature({
      id: 'child-001',
      lifecycle: SdlcLifecycle.Blocked,
      branch: 'feat/child-feature',
      repositoryPath: '/repo',
    });
    vi.mocked(mockFeatureRepo.findById).mockResolvedValue(parent);
    vi.mocked(mockFeatureRepo.findByParentId).mockResolvedValue([child]);

    await useCase.execute(parentId);

    // Stash should be called before rebase
    expect(mockGitPrService.stash).toHaveBeenCalledWith(
      '/repo',
      expect.stringContaining('auto-stash')
    );

    // rebaseOnBranch should be called with parent's branch
    expect(mockGitPrService.rebaseOnBranch).toHaveBeenCalledWith(
      '/repo',
      'feat/child-feature',
      'feat/parent-feature'
    );

    // Agent should still be spawned
    expect(mockAgentProcess.spawn).toHaveBeenCalledOnce();
  });

  it('should use parent branch name as target for rebaseOnBranch', async () => {
    const parent = makeFeature({
      id: parentId,
      lifecycle: SdlcLifecycle.Implementation,
      branch: 'feat/my-parent',
    });
    const child = makeFeature({
      id: 'child-001',
      lifecycle: SdlcLifecycle.Blocked,
      branch: 'feat/my-child',
    });
    vi.mocked(mockFeatureRepo.findById).mockResolvedValue(parent);
    vi.mocked(mockFeatureRepo.findByParentId).mockResolvedValue([child]);

    await useCase.execute(parentId);

    expect(mockGitPrService.rebaseOnBranch).toHaveBeenCalledWith(
      expect.any(String),
      'feat/my-child',
      'feat/my-parent'
    );
  });

  it('should call stashPop after successful rebase', async () => {
    const parent = makeFeature({
      id: parentId,
      lifecycle: SdlcLifecycle.Implementation,
      branch: 'feat/parent',
    });
    const child = makeFeature({
      id: 'child-001',
      lifecycle: SdlcLifecycle.Blocked,
      branch: 'feat/child',
    });
    vi.mocked(mockFeatureRepo.findById).mockResolvedValue(parent);
    vi.mocked(mockFeatureRepo.findByParentId).mockResolvedValue([child]);
    vi.mocked(mockGitPrService.stash).mockResolvedValue(true);

    await useCase.execute(parentId);

    expect(mockGitPrService.stashPop).toHaveBeenCalledWith('/repo');
  });

  it('should not call stashPop when no changes were stashed', async () => {
    const parent = makeFeature({
      id: parentId,
      lifecycle: SdlcLifecycle.Implementation,
      branch: 'feat/parent',
    });
    const child = makeFeature({
      id: 'child-001',
      lifecycle: SdlcLifecycle.Blocked,
      branch: 'feat/child',
    });
    vi.mocked(mockFeatureRepo.findById).mockResolvedValue(parent);
    vi.mocked(mockFeatureRepo.findByParentId).mockResolvedValue([child]);
    vi.mocked(mockGitPrService.stash).mockResolvedValue(false);

    await useCase.execute(parentId);

    expect(mockGitPrService.stashPop).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Agent run and phase timing creation
  // -------------------------------------------------------------------------

  it('should create agent run and phase timing for rebase operation', async () => {
    const parent = makeFeature({
      id: parentId,
      lifecycle: SdlcLifecycle.Implementation,
      branch: 'feat/parent',
    });
    const child = makeFeature({
      id: 'child-001',
      lifecycle: SdlcLifecycle.Blocked,
      branch: 'feat/child',
    });
    vi.mocked(mockFeatureRepo.findById).mockResolvedValue(parent);
    vi.mocked(mockFeatureRepo.findByParentId).mockResolvedValue([child]);

    await useCase.execute(parentId);

    // Agent run created for rebase
    expect(mockAgentRunRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        featureId: 'child-001',
        status: AgentRunStatus.running,
        prompt: expect.stringContaining('feat/parent'),
      })
    );

    // Phase timing created
    expect(mockPhaseTimingRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        phase: 'rebase-on-parent',
      })
    );

    // Phase timing completed with success
    expect(mockPhaseTimingRepo.update).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        exitCode: 'success',
      })
    );

    // Agent run marked as completed
    expect(mockAgentRunRepo.updateStatus).toHaveBeenCalledWith(
      expect.any(String),
      AgentRunStatus.completed,
      expect.objectContaining({ completedAt: expect.any(String) })
    );
  });

  // -------------------------------------------------------------------------
  // Conflict resolution
  // -------------------------------------------------------------------------

  it('should delegate to ConflictResolutionService on rebase conflict', async () => {
    const parent = makeFeature({
      id: parentId,
      lifecycle: SdlcLifecycle.Implementation,
      branch: 'feat/parent',
    });
    const child = makeFeature({
      id: 'child-001',
      lifecycle: SdlcLifecycle.Blocked,
      branch: 'feat/child',
    });
    vi.mocked(mockFeatureRepo.findById).mockResolvedValue(parent);
    vi.mocked(mockFeatureRepo.findByParentId).mockResolvedValue([child]);
    vi.mocked(mockGitPrService.rebaseOnBranch).mockRejectedValue(
      new GitPrError('Rebase conflicts', GitPrErrorCode.REBASE_CONFLICT)
    );

    await useCase.execute(parentId);

    expect(mockConflictResolution.resolve).toHaveBeenCalledWith(
      '/repo',
      'feat/child',
      'feat/parent'
    );

    // Agent should still be spawned after conflict resolution
    expect(mockAgentProcess.spawn).toHaveBeenCalledOnce();
  });

  // -------------------------------------------------------------------------
  // Rebase failure — agent still spawns
  // -------------------------------------------------------------------------

  it('should still spawn agent when rebase fails', async () => {
    const parent = makeFeature({
      id: parentId,
      lifecycle: SdlcLifecycle.Implementation,
      branch: 'feat/parent',
    });
    const child = makeFeature({
      id: 'child-001',
      lifecycle: SdlcLifecycle.Blocked,
      branch: 'feat/child',
    });
    vi.mocked(mockFeatureRepo.findById).mockResolvedValue(parent);
    vi.mocked(mockFeatureRepo.findByParentId).mockResolvedValue([child]);
    vi.mocked(mockGitPrService.rebaseOnBranch).mockRejectedValue(
      new GitPrError('Unexpected git failure', GitPrErrorCode.GIT_ERROR)
    );

    await useCase.execute(parentId);

    // Agent spawned despite rebase failure
    expect(mockAgentProcess.spawn).toHaveBeenCalledOnce();
  });

  it('should record rebase failure in phase timing', async () => {
    const parent = makeFeature({
      id: parentId,
      lifecycle: SdlcLifecycle.Implementation,
      branch: 'feat/parent',
    });
    const child = makeFeature({
      id: 'child-001',
      lifecycle: SdlcLifecycle.Blocked,
      branch: 'feat/child',
    });
    vi.mocked(mockFeatureRepo.findById).mockResolvedValue(parent);
    vi.mocked(mockFeatureRepo.findByParentId).mockResolvedValue([child]);
    vi.mocked(mockGitPrService.rebaseOnBranch).mockRejectedValue(
      new GitPrError('Unexpected git failure', GitPrErrorCode.GIT_ERROR)
    );

    await useCase.execute(parentId);

    // Phase timing records error
    expect(mockPhaseTimingRepo.update).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        exitCode: 'error',
        errorMessage: expect.stringContaining('Unexpected git failure'),
      })
    );

    // Agent run marked as failed
    expect(mockAgentRunRepo.updateStatus).toHaveBeenCalledWith(
      expect.any(String),
      AgentRunStatus.failed,
      expect.objectContaining({ error: expect.stringContaining('Unexpected git failure') })
    );
  });

  // -------------------------------------------------------------------------
  // Stash restore in finally block
  // -------------------------------------------------------------------------

  it('should call stashPop in finally block even when rebase throws', async () => {
    const parent = makeFeature({
      id: parentId,
      lifecycle: SdlcLifecycle.Implementation,
      branch: 'feat/parent',
    });
    const child = makeFeature({
      id: 'child-001',
      lifecycle: SdlcLifecycle.Blocked,
      branch: 'feat/child',
    });
    vi.mocked(mockFeatureRepo.findById).mockResolvedValue(parent);
    vi.mocked(mockFeatureRepo.findByParentId).mockResolvedValue([child]);
    vi.mocked(mockGitPrService.stash).mockResolvedValue(true);
    vi.mocked(mockGitPrService.rebaseOnBranch).mockRejectedValue(
      new GitPrError('Unexpected git failure', GitPrErrorCode.GIT_ERROR)
    );

    await useCase.execute(parentId);

    expect(mockGitPrService.stashPop).toHaveBeenCalledWith('/repo');
  });

  // -------------------------------------------------------------------------
  // Failure isolation across children
  // -------------------------------------------------------------------------

  it('should still rebase and spawn second child when first child rebase fails', async () => {
    const parent = makeFeature({
      id: parentId,
      lifecycle: SdlcLifecycle.Implementation,
      branch: 'feat/parent',
    });
    const child1 = makeFeature({
      id: 'child-001',
      lifecycle: SdlcLifecycle.Blocked,
      branch: 'feat/child-1',
      agentRunId: 'run-1',
      specPath: '/specs/1',
    });
    const child2 = makeFeature({
      id: 'child-002',
      lifecycle: SdlcLifecycle.Blocked,
      branch: 'feat/child-2',
      agentRunId: 'run-2',
      specPath: '/specs/2',
    });
    vi.mocked(mockFeatureRepo.findById).mockResolvedValue(parent);
    vi.mocked(mockFeatureRepo.findByParentId).mockResolvedValue([child1, child2]);

    // First child rebase fails, second succeeds
    vi.mocked(mockGitPrService.rebaseOnBranch)
      .mockRejectedValueOnce(new GitPrError('Git error', GitPrErrorCode.GIT_ERROR))
      .mockResolvedValueOnce(undefined);

    await useCase.execute(parentId);

    // Both lifecycle transitions happen
    expect(mockFeatureRepo.update).toHaveBeenCalledTimes(2);

    // Both agents spawned
    expect(mockAgentProcess.spawn).toHaveBeenCalledTimes(2);

    // rebaseOnBranch called for both children
    expect(mockGitPrService.rebaseOnBranch).toHaveBeenCalledTimes(2);
  });

  // -------------------------------------------------------------------------
  // Skip rebase when child has active agent run (NFR-3)
  // -------------------------------------------------------------------------

  it('should skip rebase when child has an active (running) agent run', async () => {
    const parent = makeFeature({
      id: parentId,
      lifecycle: SdlcLifecycle.Implementation,
      branch: 'feat/parent',
    });
    const child = makeFeature({
      id: 'child-001',
      lifecycle: SdlcLifecycle.Blocked,
      branch: 'feat/child',
      agentRunId: 'active-run-001',
    });
    vi.mocked(mockFeatureRepo.findById).mockResolvedValue(parent);
    vi.mocked(mockFeatureRepo.findByParentId).mockResolvedValue([child]);

    // Agent run is currently running
    vi.mocked(mockAgentRunRepo.findById).mockResolvedValue({
      id: 'active-run-001',
      status: AgentRunStatus.running,
    } as any);

    await useCase.execute(parentId);

    // Rebase skipped
    expect(mockGitPrService.rebaseOnBranch).not.toHaveBeenCalled();
    expect(mockGitPrService.stash).not.toHaveBeenCalled();

    // Lifecycle still transitions and agent still spawns
    expect(mockFeatureRepo.update).toHaveBeenCalledOnce();
    expect(mockAgentProcess.spawn).toHaveBeenCalledOnce();
  });

  it('should rebase when child agent run is not running (completed)', async () => {
    const parent = makeFeature({
      id: parentId,
      lifecycle: SdlcLifecycle.Implementation,
      branch: 'feat/parent',
    });
    const child = makeFeature({
      id: 'child-001',
      lifecycle: SdlcLifecycle.Blocked,
      branch: 'feat/child',
      agentRunId: 'completed-run-001',
    });
    vi.mocked(mockFeatureRepo.findById).mockResolvedValue(parent);
    vi.mocked(mockFeatureRepo.findByParentId).mockResolvedValue([child]);

    // Agent run is completed (not running)
    vi.mocked(mockAgentRunRepo.findById).mockResolvedValue({
      id: 'completed-run-001',
      status: AgentRunStatus.completed,
    } as any);

    await useCase.execute(parentId);

    // Rebase proceeds
    expect(mockGitPrService.rebaseOnBranch).toHaveBeenCalledOnce();
  });

  it('should rebase when child has no agent run ID', async () => {
    const parent = makeFeature({
      id: parentId,
      lifecycle: SdlcLifecycle.Implementation,
      branch: 'feat/parent',
    });
    const child = makeFeature({
      id: 'child-001',
      lifecycle: SdlcLifecycle.Blocked,
      branch: 'feat/child',
      agentRunId: undefined,
      specPath: undefined,
    });
    vi.mocked(mockFeatureRepo.findById).mockResolvedValue(parent);
    vi.mocked(mockFeatureRepo.findByParentId).mockResolvedValue([child]);

    await useCase.execute(parentId);

    // Rebase proceeds (no agent run to check)
    expect(mockGitPrService.rebaseOnBranch).toHaveBeenCalledOnce();

    // But spawn is skipped (defensive guard: no agentRunId/specPath)
    expect(mockAgentProcess.spawn).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Worktree path resolution
  // -------------------------------------------------------------------------

  it('should use worktree path when worktree exists for child branch', async () => {
    const parent = makeFeature({
      id: parentId,
      lifecycle: SdlcLifecycle.Implementation,
      branch: 'feat/parent',
    });
    const child = makeFeature({
      id: 'child-001',
      lifecycle: SdlcLifecycle.Blocked,
      branch: 'feat/child',
      repositoryPath: '/repo',
    });
    vi.mocked(mockFeatureRepo.findById).mockResolvedValue(parent);
    vi.mocked(mockFeatureRepo.findByParentId).mockResolvedValue([child]);
    vi.mocked(mockWorktreeService.exists).mockResolvedValue(true);
    vi.mocked(mockWorktreeService.getWorktreePath).mockReturnValue('/repo/.worktrees/feat-child');

    await useCase.execute(parentId);

    expect(mockWorktreeService.exists).toHaveBeenCalledWith('/repo', 'feat/child');
    expect(mockGitPrService.stash).toHaveBeenCalledWith(
      '/repo/.worktrees/feat-child',
      expect.any(String)
    );
    expect(mockGitPrService.rebaseOnBranch).toHaveBeenCalledWith(
      '/repo/.worktrees/feat-child',
      'feat/child',
      'feat/parent'
    );
  });

  it('should use repo root when no worktree exists for child branch', async () => {
    const parent = makeFeature({
      id: parentId,
      lifecycle: SdlcLifecycle.Implementation,
      branch: 'feat/parent',
    });
    const child = makeFeature({
      id: 'child-001',
      lifecycle: SdlcLifecycle.Blocked,
      branch: 'feat/child',
      repositoryPath: '/my-repo',
    });
    vi.mocked(mockFeatureRepo.findById).mockResolvedValue(parent);
    vi.mocked(mockFeatureRepo.findByParentId).mockResolvedValue([child]);
    vi.mocked(mockWorktreeService.exists).mockResolvedValue(false);

    await useCase.execute(parentId);

    expect(mockGitPrService.rebaseOnBranch).toHaveBeenCalledWith(
      '/my-repo',
      'feat/child',
      'feat/parent'
    );
  });

  // -------------------------------------------------------------------------
  // Non-blocked children are not rebased
  // -------------------------------------------------------------------------

  it('should not rebase non-blocked children', async () => {
    const parent = makeFeature({
      id: parentId,
      lifecycle: SdlcLifecycle.Implementation,
      branch: 'feat/parent',
    });
    const startedChild = makeFeature({
      id: 'child-started',
      lifecycle: SdlcLifecycle.Started,
    });
    vi.mocked(mockFeatureRepo.findById).mockResolvedValue(parent);
    vi.mocked(mockFeatureRepo.findByParentId).mockResolvedValue([startedChild]);

    await useCase.execute(parentId);

    expect(mockGitPrService.rebaseOnBranch).not.toHaveBeenCalled();
    expect(mockGitPrService.stash).not.toHaveBeenCalled();
    expect(mockAgentRunRepo.create).not.toHaveBeenCalled();
  });
});
