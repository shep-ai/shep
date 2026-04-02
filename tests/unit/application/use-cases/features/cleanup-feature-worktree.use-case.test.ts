/**
 * CleanupFeatureWorktreeUseCase Unit Tests
 *
 * Tests for post-merge cleanup: worktree unlinking, local branch deletion,
 * and remote branch deletion. All cleanup steps are non-fatal.
 *
 * TDD Phase: RED-GREEN
 */

import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CleanupFeatureWorktreeUseCase } from '@/application/use-cases/features/cleanup-feature-worktree.use-case.js';
import type { IFeatureRepository } from '@/application/ports/output/repositories/feature-repository.interface.js';
import type { IWorktreeService } from '@/application/ports/output/services/worktree-service.interface.js';
import type { IGitPrService } from '@/application/ports/output/services/git-pr-service.interface.js';
import { SdlcLifecycle, FeatureMode } from '@/domain/generated/output.js';
import type { Feature } from '@/domain/generated/output.js';

function createMockFeature(overrides?: Partial<Feature>): Feature {
  return {
    id: 'feat-123-full-uuid',
    name: 'Test Feature',
    slug: 'test-feature',
    description: 'A test feature',
    userQuery: 'test user query',
    repositoryPath: '/repo',
    branch: 'feat/test-feature',
    worktreePath: '/repo/.worktrees/feat-test-feature',
    lifecycle: SdlcLifecycle.Maintain,
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
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('CleanupFeatureWorktreeUseCase', () => {
  let useCase: CleanupFeatureWorktreeUseCase;
  let mockFeatureRepo: IFeatureRepository;
  let mockWorktreeService: IWorktreeService;
  let mockGitPrService: IGitPrService;

  beforeEach(() => {
    vi.clearAllMocks();

    mockFeatureRepo = {
      create: vi.fn(),
      findById: vi.fn().mockResolvedValue(createMockFeature()),
      findByIdPrefix: vi.fn().mockResolvedValue(null),
      findBySlug: vi.fn(),
      findByBranch: vi.fn(),
      list: vi.fn(),
      findByParentId: vi.fn().mockResolvedValue([]),
      update: vi.fn(),
      delete: vi.fn(),
      softDelete: vi.fn(),
    };

    mockWorktreeService = {
      create: vi.fn(),
      addExisting: vi.fn(),
      remove: vi.fn().mockResolvedValue(undefined),
      prune: vi.fn().mockResolvedValue(undefined),
      list: vi.fn(),
      exists: vi.fn(),
      branchExists: vi.fn(),
      remoteBranchExists: vi.fn().mockResolvedValue(true),
      getWorktreePath: vi.fn(),
      ensureGitRepository: vi.fn(),
      listBranches: vi.fn().mockResolvedValue([]),
    };

    mockGitPrService = {
      hasRemote: vi.fn(),
      getDefaultBranch: vi.fn(),
      hasUncommittedChanges: vi.fn(),
      commitAll: vi.fn(),
      push: vi.fn(),
      createPr: vi.fn(),
      mergePr: vi.fn(),
      mergeBranch: vi.fn(),
      getCiStatus: vi.fn(),
      watchCi: vi.fn(),
      deleteBranch: vi.fn().mockResolvedValue(undefined),
      getPrDiffSummary: vi.fn(),
      listPrStatuses: vi.fn(),
      verifyMerge: vi.fn(),
      getFailureLogs: vi.fn(),
      getRemoteUrl: vi.fn(),
      getFileDiffs: vi.fn(),
      getMergeableStatus: vi.fn().mockResolvedValue(undefined),
      revParse: vi.fn(),
      localMergeSquash: vi.fn().mockResolvedValue(undefined),
      syncMain: vi.fn().mockResolvedValue(undefined),
      rebaseOnMain: vi.fn().mockResolvedValue(undefined),
      getConflictedFiles: vi.fn().mockResolvedValue([]),
      stageFiles: vi.fn().mockResolvedValue(undefined),
      rebaseContinue: vi.fn().mockResolvedValue(undefined),
      rebaseAbort: vi.fn().mockResolvedValue(undefined),
      getBranchSyncStatus: vi.fn().mockResolvedValue({ ahead: 0, behind: 0 }),
      stash: vi.fn().mockResolvedValue(false),
      stashPop: vi.fn().mockResolvedValue(undefined),
      stashDrop: vi.fn().mockResolvedValue(undefined),
    };

    useCase = new CleanupFeatureWorktreeUseCase(
      mockFeatureRepo,
      mockWorktreeService,
      mockGitPrService
    );
  });

  // ---------------------------------------------------------------------------
  // Happy path
  // ---------------------------------------------------------------------------

  it('should remove worktree, delete local branch, and delete remote branch on happy path', async () => {
    const feature = createMockFeature();
    mockFeatureRepo.findById = vi.fn().mockResolvedValue(feature);
    mockWorktreeService.remoteBranchExists = vi.fn().mockResolvedValue(true);

    await useCase.execute('feat-123-full-uuid');

    expect(mockWorktreeService.remove).toHaveBeenCalledWith(
      '/repo',
      '/repo/.worktrees/feat-test-feature',
      true
    );
    expect(mockGitPrService.deleteBranch).toHaveBeenCalledWith('/repo', 'feat/test-feature');
    expect(mockWorktreeService.remoteBranchExists).toHaveBeenCalledWith(
      '/repo',
      'feat/test-feature'
    );
    expect(mockGitPrService.deleteBranch).toHaveBeenCalledWith('/repo', 'feat/test-feature', true);
  });

  // ---------------------------------------------------------------------------
  // Not-found guard
  // ---------------------------------------------------------------------------

  it('should return early without calling any service when feature is not found', async () => {
    mockFeatureRepo.findById = vi.fn().mockResolvedValue(null);

    await useCase.execute('non-existent-id');

    expect(mockWorktreeService.remove).not.toHaveBeenCalled();
    expect(mockGitPrService.deleteBranch).not.toHaveBeenCalled();
    expect(mockWorktreeService.remoteBranchExists).not.toHaveBeenCalled();
  });

  // ---------------------------------------------------------------------------
  // Edge cases — non-fatal error handling
  // ---------------------------------------------------------------------------

  it('should log warn and continue when worktree remove throws', async () => {
    const feature = createMockFeature();
    mockFeatureRepo.findById = vi.fn().mockResolvedValue(feature);
    mockWorktreeService.remove = vi.fn().mockRejectedValue(new Error('worktree not found'));
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    await useCase.execute('feat-123-full-uuid');

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('CleanupFeatureWorktreeUseCase'),
      expect.anything()
    );
    // Local branch deletion should still be called
    expect(mockGitPrService.deleteBranch).toHaveBeenCalledWith('/repo', 'feat/test-feature');
    warnSpy.mockRestore();
  });

  it('should call prune after worktree remove fails to clean stale entries', async () => {
    const feature = createMockFeature();
    mockFeatureRepo.findById = vi.fn().mockResolvedValue(feature);
    mockWorktreeService.remove = vi.fn().mockRejectedValue(new Error('is not a working tree'));
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    await useCase.execute('feat-123-full-uuid');

    expect(mockWorktreeService.prune).toHaveBeenCalledWith('/repo');
    // Branch deletion should still proceed after prune
    expect(mockGitPrService.deleteBranch).toHaveBeenCalledWith('/repo', 'feat/test-feature');
  });

  it('should not call prune when worktree remove succeeds', async () => {
    const feature = createMockFeature();
    mockFeatureRepo.findById = vi.fn().mockResolvedValue(feature);

    await useCase.execute('feat-123-full-uuid');

    expect(mockWorktreeService.prune).not.toHaveBeenCalled();
  });

  it('should continue with branch deletion even when prune fails', async () => {
    const feature = createMockFeature();
    mockFeatureRepo.findById = vi.fn().mockResolvedValue(feature);
    mockWorktreeService.remove = vi.fn().mockRejectedValue(new Error('is not a working tree'));
    mockWorktreeService.prune = vi.fn().mockRejectedValue(new Error('prune failed'));
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    await useCase.execute('feat-123-full-uuid');

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('worktree prune failed'),
      expect.anything()
    );
    expect(mockGitPrService.deleteBranch).toHaveBeenCalledWith('/repo', 'feat/test-feature');
    warnSpy.mockRestore();
  });

  it('should compute worktree path via getWorktreePath when feature has no worktreePath', async () => {
    const feature = createMockFeature({ worktreePath: undefined });
    mockFeatureRepo.findById = vi.fn().mockResolvedValue(feature);
    (mockWorktreeService.getWorktreePath as ReturnType<typeof vi.fn>).mockReturnValue(
      '/repo/.worktrees/feat-test-feature'
    );

    await useCase.execute('feat-123-full-uuid');

    expect(mockWorktreeService.getWorktreePath).toHaveBeenCalledWith('/repo', 'feat/test-feature');
    expect(mockWorktreeService.remove).toHaveBeenCalledWith(
      '/repo',
      '/repo/.worktrees/feat-test-feature',
      true
    );
    // Remaining steps still run
    expect(mockGitPrService.deleteBranch).toHaveBeenCalledWith('/repo', 'feat/test-feature');
  });

  it('should log warn and continue when local branch deleteBranch throws', async () => {
    const feature = createMockFeature();
    mockFeatureRepo.findById = vi.fn().mockResolvedValue(feature);
    mockGitPrService.deleteBranch = vi
      .fn()
      .mockRejectedValueOnce(new Error('branch not found'))
      .mockResolvedValueOnce(undefined);
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    await useCase.execute('feat-123-full-uuid');

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('CleanupFeatureWorktreeUseCase'),
      expect.anything()
    );
    // Remote branch check should still be called
    expect(mockWorktreeService.remoteBranchExists).toHaveBeenCalledWith(
      '/repo',
      'feat/test-feature'
    );
    warnSpy.mockRestore();
  });

  it('should skip remote deleteBranch when remoteBranchExists returns false', async () => {
    const feature = createMockFeature();
    mockFeatureRepo.findById = vi.fn().mockResolvedValue(feature);
    mockWorktreeService.remoteBranchExists = vi.fn().mockResolvedValue(false);

    await useCase.execute('feat-123-full-uuid');

    // deleteBranch should only be called once (local, not remote)
    expect(mockGitPrService.deleteBranch).toHaveBeenCalledTimes(1);
    expect(mockGitPrService.deleteBranch).not.toHaveBeenCalledWith(
      '/repo',
      'feat/test-feature',
      true
    );
  });

  it('should log warn and resolve without error when remoteBranchExists throws', async () => {
    const feature = createMockFeature();
    mockFeatureRepo.findById = vi.fn().mockResolvedValue(feature);
    mockWorktreeService.remoteBranchExists = vi.fn().mockRejectedValue(new Error('network error'));
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    await expect(useCase.execute('feat-123-full-uuid')).resolves.toBeUndefined();

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('CleanupFeatureWorktreeUseCase'),
      expect.anything()
    );
    warnSpy.mockRestore();
  });

  // ---------------------------------------------------------------------------
  // Idempotency guard (#354 — double delete prevention)
  // ---------------------------------------------------------------------------

  it('should skip cleanup when feature lifecycle is Deleting (idempotency guard)', async () => {
    const feature = createMockFeature({ lifecycle: SdlcLifecycle.Deleting });
    mockFeatureRepo.findById = vi.fn().mockResolvedValue(feature);

    await useCase.execute('feat-123-full-uuid');

    expect(mockWorktreeService.remove).not.toHaveBeenCalled();
    expect(mockGitPrService.deleteBranch).not.toHaveBeenCalled();
    expect(mockWorktreeService.remoteBranchExists).not.toHaveBeenCalled();
  });

  it('should not reject even when all three steps throw', async () => {
    const feature = createMockFeature();
    mockFeatureRepo.findById = vi.fn().mockResolvedValue(feature);
    mockWorktreeService.remove = vi.fn().mockRejectedValue(new Error('remove failed'));
    mockGitPrService.deleteBranch = vi.fn().mockRejectedValue(new Error('delete failed'));
    mockWorktreeService.remoteBranchExists = vi.fn().mockRejectedValue(new Error('network error'));
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    await expect(useCase.execute('feat-123-full-uuid')).resolves.toBeUndefined();
  });
});
