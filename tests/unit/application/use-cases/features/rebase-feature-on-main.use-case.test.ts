import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RebaseFeatureOnMainUseCase } from '@/application/use-cases/features/rebase-feature-on-main.use-case.js';
import type { IFeatureRepository } from '@/application/ports/output/repositories/feature-repository.interface.js';
import type { IGitPrService } from '@/application/ports/output/services/git-pr-service.interface.js';
import {
  GitPrError,
  GitPrErrorCode,
} from '@/application/ports/output/services/git-pr-service.interface.js';
import type { IWorktreeService } from '@/application/ports/output/services/worktree-service.interface.js';
import type { ConflictResolutionService } from '@/infrastructure/services/agents/conflict-resolution/conflict-resolution.service.js';
import type { IAgentRunRepository } from '@/application/ports/output/agents/agent-run-repository.interface.js';
import type { IPhaseTimingRepository } from '@/application/ports/output/agents/phase-timing-repository.interface.js';
import type { Feature } from '@/domain/generated/output.js';
import { SdlcLifecycle, FeatureMode } from '@/domain/generated/output.js';

function createMockFeatureRepo(): IFeatureRepository {
  return {
    create: vi.fn(),
    findById: vi.fn().mockResolvedValue(null),
    findByIdPrefix: vi.fn().mockResolvedValue(null),
    findBySlug: vi.fn().mockResolvedValue(null),
    list: vi.fn().mockResolvedValue([]),
    update: vi.fn(),
    findByParentId: vi.fn().mockResolvedValue([]),
    delete: vi.fn(),
    softDelete: vi.fn(),
  } as unknown as IFeatureRepository;
}

function createMockGitPrService(): IGitPrService {
  return {
    getDefaultBranch: vi.fn().mockResolvedValue('main'),
    syncMain: vi.fn().mockResolvedValue(undefined),
    rebaseOnMain: vi.fn().mockResolvedValue(undefined),
    createBranch: vi.fn(),
    checkoutBranch: vi.fn(),
    hasUncommittedChanges: vi.fn(),
    hasRemote: vi.fn(),
    push: vi.fn(),
    createPr: vi.fn(),
    mergePr: vi.fn(),
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
    getFailureLogs: vi.fn(),
    getConflictedFiles: vi.fn(),
    stageFiles: vi.fn(),
    rebaseContinue: vi.fn(),
    rebaseAbort: vi.fn(),
    stash: vi.fn().mockResolvedValue(false),
    stashPop: vi.fn().mockResolvedValue(undefined),
    stashDrop: vi.fn().mockResolvedValue(undefined),
  } as unknown as IGitPrService;
}

function createMockWorktreeService(): IWorktreeService {
  return {
    create: vi.fn(),
    remove: vi.fn(),
    list: vi.fn(),
    exists: vi.fn().mockResolvedValue(false),
    branchExists: vi.fn(),
    remoteBranchExists: vi.fn(),
    getWorktreePath: vi.fn().mockReturnValue('/repo/.worktrees/feat-x'),
    prune: vi.fn(),
    ensureGitRepository: vi.fn(),
  } as unknown as IWorktreeService;
}

function createMockConflictResolution(): ConflictResolutionService {
  return {
    resolve: vi.fn().mockResolvedValue(undefined),
    resolveStashPop: vi.fn().mockResolvedValue(undefined),
  } as unknown as ConflictResolutionService;
}

function createMockAgentRunRepo(): IAgentRunRepository {
  return {
    create: vi.fn().mockResolvedValue(undefined),
    findById: vi.fn(),
    findByThreadId: vi.fn(),
    updateStatus: vi.fn().mockResolvedValue(undefined),
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

const sampleFeature: Feature = {
  id: 'feat-abc-123',
  name: 'My Feature',
  slug: 'my-feature',
  userQuery: 'add something',
  description: 'A test feature',
  repositoryPath: '/home/user/my-project',
  branch: 'feat/my-feature',
  lifecycle: SdlcLifecycle.Implementation,
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
  approvalGates: { allowPrd: true, allowPlan: true, allowMerge: true },
  createdAt: new Date(),
  updatedAt: new Date(),
} as Feature;

describe('RebaseFeatureOnMainUseCase', () => {
  let useCase: RebaseFeatureOnMainUseCase;
  let mockFeatureRepo: IFeatureRepository;
  let mockGitPrService: IGitPrService;
  let mockWorktreeService: IWorktreeService;
  let mockConflictResolution: ConflictResolutionService;
  let mockAgentRunRepo: IAgentRunRepository;
  let mockPhaseTimingRepo: IPhaseTimingRepository;

  beforeEach(() => {
    vi.clearAllMocks();
    mockFeatureRepo = createMockFeatureRepo();
    mockGitPrService = createMockGitPrService();
    mockWorktreeService = createMockWorktreeService();
    mockConflictResolution = createMockConflictResolution();
    mockAgentRunRepo = createMockAgentRunRepo();
    mockPhaseTimingRepo = createMockPhaseTimingRepo();
    useCase = new RebaseFeatureOnMainUseCase(
      mockFeatureRepo,
      mockGitPrService,
      mockWorktreeService,
      mockConflictResolution,
      mockAgentRunRepo,
      mockPhaseTimingRepo
    );
  });

  it('should sync main and rebase cleanly on happy path', async () => {
    vi.mocked(mockFeatureRepo.findById).mockResolvedValue(sampleFeature);

    await useCase.execute('feat-abc-123');

    expect(mockGitPrService.getDefaultBranch).toHaveBeenCalledWith('/home/user/my-project');
    expect(mockGitPrService.syncMain).toHaveBeenCalledWith('/home/user/my-project', 'main');
    expect(mockGitPrService.rebaseOnMain).toHaveBeenCalledWith(
      '/home/user/my-project',
      'feat/my-feature',
      'main'
    );
    expect(mockConflictResolution.resolve).not.toHaveBeenCalled();
  });

  it('should throw when feature not found', async () => {
    vi.mocked(mockFeatureRepo.findById).mockResolvedValue(null);
    vi.mocked(mockFeatureRepo.findByIdPrefix).mockResolvedValue(null);

    await expect(useCase.execute('non-existent')).rejects.toThrow(
      'Feature not found: "non-existent"'
    );

    expect(mockGitPrService.syncMain).not.toHaveBeenCalled();
    expect(mockGitPrService.rebaseOnMain).not.toHaveBeenCalled();
  });

  it('should resolve feature by prefix when exact ID not found', async () => {
    vi.mocked(mockFeatureRepo.findById).mockResolvedValue(null);
    vi.mocked(mockFeatureRepo.findByIdPrefix).mockResolvedValue(sampleFeature);

    await useCase.execute('feat-abc');

    expect(mockFeatureRepo.findById).toHaveBeenCalledWith('feat-abc');
    expect(mockFeatureRepo.findByIdPrefix).toHaveBeenCalledWith('feat-abc');
    expect(mockGitPrService.rebaseOnMain).toHaveBeenCalled();
  });

  it('should use worktree path as cwd when worktree exists', async () => {
    vi.mocked(mockFeatureRepo.findById).mockResolvedValue(sampleFeature);
    vi.mocked(mockWorktreeService.exists).mockResolvedValue(true);
    vi.mocked(mockWorktreeService.getWorktreePath).mockReturnValue(
      '/home/user/my-project/.worktrees/feat-my-feature'
    );

    await useCase.execute('feat-abc-123');

    expect(mockWorktreeService.exists).toHaveBeenCalledWith(
      '/home/user/my-project',
      'feat/my-feature'
    );
    expect(mockGitPrService.syncMain).toHaveBeenCalledWith(
      '/home/user/my-project/.worktrees/feat-my-feature',
      'main'
    );
    expect(mockGitPrService.rebaseOnMain).toHaveBeenCalledWith(
      '/home/user/my-project/.worktrees/feat-my-feature',
      'feat/my-feature',
      'main'
    );
  });

  it('should use repo root as cwd when no worktree exists', async () => {
    vi.mocked(mockFeatureRepo.findById).mockResolvedValue(sampleFeature);
    vi.mocked(mockWorktreeService.exists).mockResolvedValue(false);

    await useCase.execute('feat-abc-123');

    expect(mockGitPrService.syncMain).toHaveBeenCalledWith('/home/user/my-project', 'main');
    expect(mockGitPrService.rebaseOnMain).toHaveBeenCalledWith(
      '/home/user/my-project',
      'feat/my-feature',
      'main'
    );
  });

  it('should delegate to conflict resolution service on REBASE_CONFLICT', async () => {
    vi.mocked(mockFeatureRepo.findById).mockResolvedValue(sampleFeature);
    vi.mocked(mockGitPrService.rebaseOnMain).mockRejectedValue(
      new GitPrError('Rebase conflicts detected', GitPrErrorCode.REBASE_CONFLICT)
    );

    await useCase.execute('feat-abc-123');

    expect(mockConflictResolution.resolve).toHaveBeenCalledWith(
      '/home/user/my-project',
      'feat/my-feature',
      'main'
    );
  });

  it('should propagate conflict resolution failure', async () => {
    vi.mocked(mockFeatureRepo.findById).mockResolvedValue(sampleFeature);
    vi.mocked(mockGitPrService.rebaseOnMain).mockRejectedValue(
      new GitPrError('Rebase conflicts', GitPrErrorCode.REBASE_CONFLICT)
    );
    vi.mocked(mockConflictResolution.resolve).mockRejectedValue(
      new GitPrError('Failed to resolve after 3 attempts', GitPrErrorCode.REBASE_CONFLICT)
    );

    const error = await useCase.execute('feat-abc-123').catch((e) => e);

    expect(error).toBeInstanceOf(GitPrError);
    expect(error.code).toBe(GitPrErrorCode.REBASE_CONFLICT);
  });

  it('should propagate SYNC_FAILED error without attempting rebase', async () => {
    vi.mocked(mockFeatureRepo.findById).mockResolvedValue(sampleFeature);
    vi.mocked(mockGitPrService.syncMain).mockRejectedValue(
      new GitPrError('Cannot fast-forward', GitPrErrorCode.SYNC_FAILED)
    );

    const error = await useCase.execute('feat-abc-123').catch((e) => e);

    expect(error).toBeInstanceOf(GitPrError);
    expect(error.code).toBe(GitPrErrorCode.SYNC_FAILED);
    expect(mockGitPrService.rebaseOnMain).not.toHaveBeenCalled();
  });

  it('should propagate non-rebase git errors directly', async () => {
    vi.mocked(mockFeatureRepo.findById).mockResolvedValue(sampleFeature);
    vi.mocked(mockGitPrService.rebaseOnMain).mockRejectedValue(
      new GitPrError('Unexpected git failure', GitPrErrorCode.GIT_ERROR)
    );

    const error = await useCase.execute('feat-abc-123').catch((e) => e);

    expect(error).toBeInstanceOf(GitPrError);
    expect(error.code).toBe(GitPrErrorCode.GIT_ERROR);
    expect(mockConflictResolution.resolve).not.toHaveBeenCalled();
  });

  it('should stash uncommitted changes before rebase and pop after', async () => {
    vi.mocked(mockFeatureRepo.findById).mockResolvedValue(sampleFeature);
    vi.mocked(mockGitPrService.stash).mockResolvedValue(true);

    await useCase.execute('feat-abc-123');

    expect(mockGitPrService.stash).toHaveBeenCalledWith(
      '/home/user/my-project',
      'shep-auto-stash: feat/my-feature'
    );
    expect(mockGitPrService.rebaseOnMain).toHaveBeenCalled();
    expect(mockGitPrService.stashPop).toHaveBeenCalledWith('/home/user/my-project');
  });

  it('should not pop stash when no changes were stashed', async () => {
    vi.mocked(mockFeatureRepo.findById).mockResolvedValue(sampleFeature);
    vi.mocked(mockGitPrService.stash).mockResolvedValue(false);

    await useCase.execute('feat-abc-123');

    expect(mockGitPrService.stash).toHaveBeenCalled();
    expect(mockGitPrService.stashPop).not.toHaveBeenCalled();
  });

  it('should pop stash after rebase with conflict resolution', async () => {
    vi.mocked(mockFeatureRepo.findById).mockResolvedValue(sampleFeature);
    vi.mocked(mockGitPrService.stash).mockResolvedValue(true);
    vi.mocked(mockGitPrService.rebaseOnMain).mockRejectedValue(
      new GitPrError('Rebase conflicts detected', GitPrErrorCode.REBASE_CONFLICT)
    );

    await useCase.execute('feat-abc-123');

    expect(mockConflictResolution.resolve).toHaveBeenCalled();
    expect(mockGitPrService.stashPop).toHaveBeenCalledWith('/home/user/my-project');
  });

  it('should pop stash even when rebase fails with non-conflict error', async () => {
    vi.mocked(mockFeatureRepo.findById).mockResolvedValue(sampleFeature);
    vi.mocked(mockGitPrService.stash).mockResolvedValue(true);
    vi.mocked(mockGitPrService.rebaseOnMain).mockRejectedValue(
      new GitPrError('Unexpected git failure', GitPrErrorCode.GIT_ERROR)
    );

    const error = await useCase.execute('feat-abc-123').catch((e) => e);

    expect(error).toBeInstanceOf(GitPrError);
    expect(error.code).toBe(GitPrErrorCode.GIT_ERROR);
    expect(mockGitPrService.stashPop).toHaveBeenCalledWith('/home/user/my-project');
  });

  it('should stash and pop with worktree path', async () => {
    vi.mocked(mockFeatureRepo.findById).mockResolvedValue(sampleFeature);
    vi.mocked(mockWorktreeService.exists).mockResolvedValue(true);
    vi.mocked(mockWorktreeService.getWorktreePath).mockReturnValue(
      '/home/user/my-project/.worktrees/feat-my-feature'
    );
    vi.mocked(mockGitPrService.stash).mockResolvedValue(true);

    await useCase.execute('feat-abc-123');

    expect(mockGitPrService.stash).toHaveBeenCalledWith(
      '/home/user/my-project/.worktrees/feat-my-feature',
      'shep-auto-stash: feat/my-feature'
    );
    expect(mockGitPrService.stashPop).toHaveBeenCalledWith(
      '/home/user/my-project/.worktrees/feat-my-feature'
    );
  });

  it('should invoke resolveStashPop and stashDrop when stashPop fails', async () => {
    vi.mocked(mockFeatureRepo.findById).mockResolvedValue(sampleFeature);
    vi.mocked(mockGitPrService.stash).mockResolvedValue(true);
    vi.mocked(mockGitPrService.stashPop).mockRejectedValue(
      new GitPrError('stash pop conflict', GitPrErrorCode.GIT_ERROR)
    );

    await useCase.execute('feat-abc-123');

    expect(mockConflictResolution.resolveStashPop).toHaveBeenCalledWith(
      '/home/user/my-project',
      'feat/my-feature',
      'main'
    );
    expect(mockGitPrService.stashDrop).toHaveBeenCalledWith('/home/user/my-project');
  });

  it('should throw distinguishable error when resolveStashPop also fails', async () => {
    vi.mocked(mockFeatureRepo.findById).mockResolvedValue(sampleFeature);
    vi.mocked(mockGitPrService.stash).mockResolvedValue(true);
    vi.mocked(mockGitPrService.stashPop).mockRejectedValue(
      new GitPrError('stash pop conflict', GitPrErrorCode.GIT_ERROR)
    );
    vi.mocked(mockConflictResolution.resolveStashPop).mockRejectedValue(
      new Error('Failed to resolve stash pop conflicts after 3 attempts')
    );

    const error = await useCase.execute('feat-abc-123').catch((e) => e);

    expect(error).toBeInstanceOf(Error);
    expect(error.message).toContain('Rebase succeeded');
    expect(error.message).toContain('git stash pop');
    expect(mockGitPrService.stashDrop).not.toHaveBeenCalled();
  });

  it('should invoke resolveStashPop after rebase conflict resolution when stash pop fails', async () => {
    vi.mocked(mockFeatureRepo.findById).mockResolvedValue(sampleFeature);
    vi.mocked(mockGitPrService.stash).mockResolvedValue(true);
    vi.mocked(mockGitPrService.rebaseOnMain).mockRejectedValue(
      new GitPrError('Rebase conflicts detected', GitPrErrorCode.REBASE_CONFLICT)
    );
    vi.mocked(mockGitPrService.stashPop).mockRejectedValue(
      new GitPrError('stash pop conflict', GitPrErrorCode.GIT_ERROR)
    );

    await useCase.execute('feat-abc-123');

    expect(mockConflictResolution.resolve).toHaveBeenCalledWith(
      '/home/user/my-project',
      'feat/my-feature',
      'main'
    );
    expect(mockConflictResolution.resolveStashPop).toHaveBeenCalledWith(
      '/home/user/my-project',
      'feat/my-feature',
      'main'
    );
    expect(mockGitPrService.stashDrop).toHaveBeenCalledWith('/home/user/my-project');
  });

  it('should invoke resolveStashPop with worktree path when stash pop fails', async () => {
    vi.mocked(mockFeatureRepo.findById).mockResolvedValue(sampleFeature);
    vi.mocked(mockWorktreeService.exists).mockResolvedValue(true);
    vi.mocked(mockWorktreeService.getWorktreePath).mockReturnValue(
      '/home/user/my-project/.worktrees/feat-my-feature'
    );
    vi.mocked(mockGitPrService.stash).mockResolvedValue(true);
    vi.mocked(mockGitPrService.stashPop).mockRejectedValue(
      new GitPrError('stash pop conflict', GitPrErrorCode.GIT_ERROR)
    );

    await useCase.execute('feat-abc-123');

    expect(mockConflictResolution.resolveStashPop).toHaveBeenCalledWith(
      '/home/user/my-project/.worktrees/feat-my-feature',
      'feat/my-feature',
      'main'
    );
    expect(mockGitPrService.stashDrop).toHaveBeenCalledWith(
      '/home/user/my-project/.worktrees/feat-my-feature'
    );
  });

  it('should propagate rebase error when both rebase and stash pop fail', async () => {
    vi.mocked(mockFeatureRepo.findById).mockResolvedValue(sampleFeature);
    vi.mocked(mockGitPrService.stash).mockResolvedValue(true);
    // Rebase fails with a non-conflict error (e.g. GIT_ERROR)
    vi.mocked(mockGitPrService.rebaseOnMain).mockRejectedValue(
      new GitPrError('Unexpected git failure', GitPrErrorCode.GIT_ERROR)
    );
    // Stash pop also fails
    vi.mocked(mockGitPrService.stashPop).mockRejectedValue(
      new GitPrError('stash pop conflict', GitPrErrorCode.GIT_ERROR)
    );
    // resolveStashPop also fails
    vi.mocked(mockConflictResolution.resolveStashPop).mockRejectedValue(
      new Error('Failed to resolve stash pop')
    );

    const error = await useCase.execute('feat-abc-123').catch((e) => e);

    // The rebase GIT_ERROR should propagate, not the stash pop error
    expect(error).toBeInstanceOf(GitPrError);
    expect(error.code).toBe(GitPrErrorCode.GIT_ERROR);
    expect(error.message).toContain('Unexpected git failure');
  });

  it('should not invoke resolveStashPop when stashPop succeeds', async () => {
    vi.mocked(mockFeatureRepo.findById).mockResolvedValue(sampleFeature);
    vi.mocked(mockGitPrService.stash).mockResolvedValue(true);

    await useCase.execute('feat-abc-123');

    expect(mockConflictResolution.resolveStashPop).not.toHaveBeenCalled();
    expect(mockGitPrService.stashDrop).not.toHaveBeenCalled();
  });
});
