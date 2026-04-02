import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SdlcLifecycle, PrStatus, FeatureMode } from '@/domain/generated/output.js';
import type { IFeatureRepository } from '@/application/ports/output/repositories/feature-repository.interface.js';
import type { IRepositoryRepository } from '@/application/ports/output/repositories/repository-repository.interface.js';
import type { IWorktreeService } from '@/application/ports/output/services/worktree-service.interface.js';
import type { IGitPrService } from '@/application/ports/output/services/git-pr-service.interface.js';
import { AdoptBranchUseCase } from '@/application/use-cases/features/adopt-branch.use-case.js';

describe('AdoptBranchUseCase', () => {
  let mockFeatureRepo: IFeatureRepository;
  let mockRepositoryRepo: IRepositoryRepository;
  let mockWorktreeService: IWorktreeService;
  let mockGitPrService: IGitPrService;
  let useCase: AdoptBranchUseCase;

  const repoPath = '/home/user/my-project';
  const mockRepository = {
    id: 'repo-123',
    name: 'my-project',
    path: repoPath,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(() => {
    mockFeatureRepo = {
      create: vi.fn().mockResolvedValue(undefined),
      findById: vi.fn().mockResolvedValue(null),
      findByIdPrefix: vi.fn().mockResolvedValue(null),
      findBySlug: vi.fn().mockResolvedValue(null),
      findByBranch: vi.fn().mockResolvedValue(null),
      list: vi.fn().mockResolvedValue([]),
      update: vi.fn().mockResolvedValue(undefined),
      findByParentId: vi.fn().mockResolvedValue([]),
      delete: vi.fn().mockResolvedValue(undefined),
      softDelete: vi.fn().mockResolvedValue(undefined),
    };

    mockRepositoryRepo = {
      create: vi.fn().mockResolvedValue(mockRepository),
      findById: vi.fn().mockResolvedValue(null),
      findByPath: vi.fn().mockResolvedValue(mockRepository),
      findByPathIncludingDeleted: vi.fn().mockResolvedValue(null),
      findByRemoteUrl: vi.fn().mockResolvedValue(null),
      list: vi.fn().mockResolvedValue([]),
      remove: vi.fn().mockResolvedValue(undefined),
      softDelete: vi.fn().mockResolvedValue(undefined),
      restore: vi.fn().mockResolvedValue(undefined),
      update: vi.fn().mockResolvedValue(undefined),
    };

    mockWorktreeService = {
      create: vi.fn().mockResolvedValue({ path: '/wt', head: 'abc', branch: 'b', isMain: false }),
      addExisting: vi.fn().mockResolvedValue({
        path: '/wt',
        head: 'abc',
        branch: 'b',
        isMain: false,
      }),
      remove: vi.fn().mockResolvedValue(undefined),
      list: vi.fn().mockResolvedValue([]),
      exists: vi.fn().mockResolvedValue(false),
      branchExists: vi.fn().mockResolvedValue(true),
      remoteBranchExists: vi.fn().mockResolvedValue(false),
      getWorktreePath: vi.fn().mockReturnValue('/home/user/.shep/repos/hash/wt/fix-login-bug'),
      prune: vi.fn().mockResolvedValue(undefined),
      ensureGitRepository: vi.fn().mockResolvedValue(undefined),
      listBranches: vi.fn().mockResolvedValue([]),
    };

    mockGitPrService = {
      hasRemote: vi.fn().mockResolvedValue(false),
      listPrStatuses: vi.fn().mockResolvedValue([]),
      getRemoteUrl: vi.fn().mockResolvedValue(null),
      getDefaultBranch: vi.fn().mockResolvedValue('main'),
      revParse: vi.fn().mockResolvedValue('abc123'),
      hasUncommittedChanges: vi.fn().mockResolvedValue(false),
      commitAll: vi.fn().mockResolvedValue('abc123'),
      push: vi.fn().mockResolvedValue(undefined),
      createPr: vi.fn().mockResolvedValue({ url: '', number: 0 }),
      mergePr: vi.fn().mockResolvedValue(undefined),
      mergeBranch: vi.fn().mockResolvedValue(undefined),
      getCiStatus: vi.fn().mockResolvedValue({ status: 'success' }),
      watchCi: vi.fn().mockResolvedValue({ status: 'success' }),
      deleteBranch: vi.fn().mockResolvedValue(undefined),
      getPrDiffSummary: vi
        .fn()
        .mockResolvedValue({ filesChanged: 0, additions: 0, deletions: 0, commitCount: 0 }),
      getFileDiffs: vi.fn().mockResolvedValue([]),
      verifyMerge: vi.fn().mockResolvedValue(false),
      localMergeSquash: vi.fn().mockResolvedValue(undefined),
      getMergeableStatus: vi.fn().mockResolvedValue(undefined),
      getFailureLogs: vi.fn().mockResolvedValue(''),
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

    useCase = new AdoptBranchUseCase(
      mockFeatureRepo,
      mockRepositoryRepo,
      mockWorktreeService,
      mockGitPrService
    );
  });

  describe('happy path — local branch', () => {
    it('should create a feature for a local branch with correct field values', async () => {
      const result = await useCase.execute({
        branchName: 'fix/login-bug',
        repositoryPath: repoPath,
      });

      expect(result.feature).toBeDefined();
      expect(result.feature.branch).toBe('fix/login-bug');
      expect(result.feature.name).toBe('Login Bug');
      expect(result.feature.slug).toBe('fix-login-bug');
      expect(result.feature.lifecycle).toBe(SdlcLifecycle.Maintain);
      expect(result.feature.userQuery).toBe('');
      expect(result.feature.specPath).toBeUndefined();
      expect(result.feature.agentRunId).toBeUndefined();
      expect(result.feature.messages).toEqual([]);
      expect(result.feature.relatedArtifacts).toEqual([]);
      expect(result.feature.mode).toBe(FeatureMode.Regular);
      expect(result.feature.push).toBe(false);
      expect(result.feature.openPr).toBe(false);
      expect(result.feature.approvalGates).toEqual({
        allowPrd: false,
        allowPlan: false,
        allowMerge: false,
      });
      expect(result.feature.repositoryId).toBe('repo-123');
      expect(result.feature.id).toBeDefined();
      expect(result.feature.createdAt).toBeDefined();
      expect(result.feature.updatedAt).toBeDefined();
    });

    it('should call branchExists to validate the branch', async () => {
      await useCase.execute({ branchName: 'fix/login-bug', repositoryPath: repoPath });

      expect(mockWorktreeService.branchExists).toHaveBeenCalledWith(repoPath, 'fix/login-bug');
    });

    it('should create a worktree via addExisting', async () => {
      await useCase.execute({ branchName: 'fix/login-bug', repositoryPath: repoPath });

      expect(mockWorktreeService.addExisting).toHaveBeenCalledWith(
        repoPath,
        'fix/login-bug',
        '/home/user/.shep/repos/hash/wt/fix-login-bug'
      );
    });

    it('should persist the feature via featureRepo.create', async () => {
      const result = await useCase.execute({
        branchName: 'fix/login-bug',
        repositoryPath: repoPath,
      });

      expect(mockFeatureRepo.create).toHaveBeenCalledWith(result.feature);
    });

    it('should preserve the branch name verbatim', async () => {
      const result = await useCase.execute({
        branchName: 'feat/auth/login-bug',
        repositoryPath: repoPath,
      });

      expect(result.feature.branch).toBe('feat/auth/login-bug');
    });
  });

  describe('repository resolution', () => {
    it('should reuse an existing repository when findByPath returns one', async () => {
      await useCase.execute({ branchName: 'fix/login-bug', repositoryPath: repoPath });

      expect(mockRepositoryRepo.findByPath).toHaveBeenCalled();
      expect(mockRepositoryRepo.create).not.toHaveBeenCalled();
    });

    it('should create a new repository when findByPath returns null', async () => {
      (mockRepositoryRepo.findByPath as any).mockResolvedValue(null);

      const result = await useCase.execute({
        branchName: 'fix/login-bug',
        repositoryPath: repoPath,
      });

      expect(mockRepositoryRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'my-project',
          path: repoPath,
        })
      );
      expect(result.feature.repositoryId).toBe('repo-123');
    });
  });

  describe('remote branch support', () => {
    it('should use origin/<branch> when branch exists only on remote', async () => {
      (mockWorktreeService.branchExists as any).mockResolvedValue(false);
      (mockWorktreeService.remoteBranchExists as any).mockResolvedValue(true);

      await useCase.execute({ branchName: 'fix/login-bug', repositoryPath: repoPath });

      expect(mockWorktreeService.addExisting).toHaveBeenCalledWith(
        repoPath,
        'origin/fix/login-bug',
        expect.any(String)
      );
    });

    it('should throw when branch does not exist locally or on remote', async () => {
      (mockWorktreeService.branchExists as any).mockResolvedValue(false);
      (mockWorktreeService.remoteBranchExists as any).mockResolvedValue(false);

      await expect(
        useCase.execute({ branchName: 'nonexistent-branch', repositoryPath: repoPath })
      ).rejects.toThrow(/Branch "nonexistent-branch" does not exist locally or on the remote/);
    });

    it('should include helpful suggestions in the branch-not-found error', async () => {
      (mockWorktreeService.branchExists as any).mockResolvedValue(false);
      (mockWorktreeService.remoteBranchExists as any).mockResolvedValue(false);

      await expect(
        useCase.execute({ branchName: 'no-such-branch', repositoryPath: repoPath })
      ).rejects.toThrow(/Check the branch name spelling/);
    });
  });

  describe('validation guards', () => {
    it('should reject adoption of the "main" branch', async () => {
      await expect(
        useCase.execute({ branchName: 'main', repositoryPath: repoPath })
      ).rejects.toThrow(/Cannot adopt the "main" branch/);

      expect(mockFeatureRepo.create).not.toHaveBeenCalled();
    });

    it('should reject adoption of the "master" branch', async () => {
      await expect(
        useCase.execute({ branchName: 'master', repositoryPath: repoPath })
      ).rejects.toThrow(/Cannot adopt the "master" branch/);

      expect(mockFeatureRepo.create).not.toHaveBeenCalled();
    });

    it('should reject duplicate adoption with existing feature details', async () => {
      const existingFeature = {
        id: 'feat-456',
        name: 'Login Bug',
        branch: 'fix/login-bug',
        slug: 'fix-login-bug',
        lifecycle: SdlcLifecycle.Maintain,
      };
      (mockFeatureRepo.findByBranch as any).mockResolvedValue(existingFeature);

      await expect(
        useCase.execute({ branchName: 'fix/login-bug', repositoryPath: repoPath })
      ).rejects.toThrow(/already tracked as feature "Login Bug" \(feat-456\)/);

      expect(mockFeatureRepo.create).not.toHaveBeenCalled();
    });

    it('should reject when slug collides with existing feature', async () => {
      (mockFeatureRepo.findBySlug as any).mockResolvedValue({
        id: 'feat-789',
        name: 'Fix Login Bug',
        slug: 'fix-login-bug',
      });

      await expect(
        useCase.execute({ branchName: 'fix/login-bug', repositoryPath: repoPath })
      ).rejects.toThrow(/slug "fix-login-bug" already exists/);

      expect(mockFeatureRepo.create).not.toHaveBeenCalled();
    });
  });

  describe('existing worktree reuse', () => {
    it('should reuse existing worktree without calling addExisting', async () => {
      (mockWorktreeService.exists as any).mockResolvedValue(true);

      const result = await useCase.execute({
        branchName: 'fix/login-bug',
        repositoryPath: repoPath,
      });

      expect(mockWorktreeService.addExisting).not.toHaveBeenCalled();
      expect(result.feature.worktreePath).toBe('/home/user/.shep/repos/hash/wt/fix-login-bug');
      expect(mockFeatureRepo.create).toHaveBeenCalled();
    });
  });

  describe('PR detection', () => {
    it('should set openPr=true and populate pr data when branch has an open PR', async () => {
      (mockGitPrService.hasRemote as any).mockResolvedValue(true);
      (mockGitPrService.listPrStatuses as any).mockResolvedValue([
        {
          number: 42,
          state: PrStatus.Open,
          url: 'https://github.com/org/repo/pull/42',
          headRefName: 'fix/login-bug',
          mergeable: true,
        },
      ]);

      const result = await useCase.execute({
        branchName: 'fix/login-bug',
        repositoryPath: repoPath,
      });

      expect(result.feature.openPr).toBe(true);
      expect(result.feature.pr).toEqual({
        url: 'https://github.com/org/repo/pull/42',
        number: 42,
        status: PrStatus.Open,
        mergeable: true,
      });
      expect(result.feature.lifecycle).toBe(SdlcLifecycle.Review);
    });

    it('should set openPr=true and populate pr data when branch has a merged PR', async () => {
      (mockGitPrService.hasRemote as any).mockResolvedValue(true);
      (mockGitPrService.listPrStatuses as any).mockResolvedValue([
        {
          number: 99,
          state: PrStatus.Merged,
          url: 'https://github.com/org/repo/pull/99',
          headRefName: 'fix/login-bug',
          mergeable: undefined,
        },
      ]);

      const result = await useCase.execute({
        branchName: 'fix/login-bug',
        repositoryPath: repoPath,
      });

      expect(result.feature.openPr).toBe(true);
      expect(result.feature.pr).toEqual({
        url: 'https://github.com/org/repo/pull/99',
        number: 99,
        status: PrStatus.Merged,
        mergeable: undefined,
      });
      expect(result.feature.lifecycle).toBe(SdlcLifecycle.Maintain);
    });

    it('should set openPr=false when branch has a closed (not merged) PR', async () => {
      (mockGitPrService.hasRemote as any).mockResolvedValue(true);
      (mockGitPrService.listPrStatuses as any).mockResolvedValue([
        {
          number: 10,
          state: PrStatus.Closed,
          url: 'https://github.com/org/repo/pull/10',
          headRefName: 'fix/login-bug',
          mergeable: undefined,
        },
      ]);

      const result = await useCase.execute({
        branchName: 'fix/login-bug',
        repositoryPath: repoPath,
      });

      expect(result.feature.openPr).toBe(false);
      expect(result.feature.pr).toBeUndefined();
    });

    it('should set openPr=false when no PR exists for the branch', async () => {
      (mockGitPrService.hasRemote as any).mockResolvedValue(true);
      (mockGitPrService.listPrStatuses as any).mockResolvedValue([
        {
          number: 5,
          state: PrStatus.Open,
          url: 'https://github.com/org/repo/pull/5',
          headRefName: 'other-branch',
        },
      ]);

      const result = await useCase.execute({
        branchName: 'fix/login-bug',
        repositoryPath: repoPath,
      });

      expect(result.feature.openPr).toBe(false);
      expect(result.feature.pr).toBeUndefined();
    });

    it('should set openPr=false when repo has no remote', async () => {
      (mockGitPrService.hasRemote as any).mockResolvedValue(false);

      const result = await useCase.execute({
        branchName: 'fix/login-bug',
        repositoryPath: repoPath,
      });

      expect(result.feature.openPr).toBe(false);
      expect(result.feature.pr).toBeUndefined();
      expect(mockGitPrService.listPrStatuses).not.toHaveBeenCalled();
    });

    it('should gracefully skip PR detection when gh CLI fails', async () => {
      (mockGitPrService.hasRemote as any).mockResolvedValue(true);
      (mockGitPrService.listPrStatuses as any).mockRejectedValue(
        new Error('gh: command not found')
      );

      const result = await useCase.execute({
        branchName: 'fix/login-bug',
        repositoryPath: repoPath,
      });

      expect(result.feature.openPr).toBe(false);
      expect(result.feature.pr).toBeUndefined();
      expect(result.feature.lifecycle).toBe(SdlcLifecycle.Maintain);
    });
  });
});
