import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GetBranchSyncStatusUseCase } from '@/application/use-cases/features/get-branch-sync-status.use-case';
import type { IFeatureRepository } from '@/application/ports/output/repositories/feature-repository.interface';
import type { IGitPrService } from '@/application/ports/output/services/git-pr-service.interface';
import type { IWorktreeService } from '@/application/ports/output/services/worktree-service.interface';
import type { Feature } from '@/domain/generated/output';
import { SdlcLifecycle, FeatureMode } from '@/domain/generated/output';

describe('GetBranchSyncStatusUseCase', () => {
  let featureRepo: IFeatureRepository;
  let gitPrService: IGitPrService;
  let worktreeService: IWorktreeService;
  let useCase: GetBranchSyncStatusUseCase;

  const mockFeature: Feature = {
    id: 'feat-123',
    name: 'Test Feature',
    slug: 'test-feature',
    userQuery: 'test',
    description: 'Test',
    repositoryPath: '/repo',
    branch: 'feat/test',
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

  beforeEach(() => {
    featureRepo = {
      findById: vi.fn().mockResolvedValue(mockFeature),
      findByIdPrefix: vi.fn(),
    } as unknown as IFeatureRepository;

    gitPrService = {
      hasRemote: vi.fn().mockResolvedValue(true),
      getDefaultBranch: vi.fn().mockResolvedValue('main'),
      syncMain: vi.fn().mockResolvedValue(undefined),
      getBranchSyncStatus: vi.fn().mockResolvedValue({ ahead: 2, behind: 5 }),
    } as unknown as IGitPrService;

    worktreeService = {
      exists: vi.fn().mockResolvedValue(false),
      getWorktreePath: vi.fn(),
    } as unknown as IWorktreeService;

    useCase = new GetBranchSyncStatusUseCase(featureRepo, gitPrService, worktreeService);
  });

  it('should return sync status for a feature', async () => {
    const result = await useCase.execute('feat-123');

    expect(result).toEqual({ ahead: 2, behind: 5, baseBranch: 'main' });
    expect(gitPrService.syncMain).toHaveBeenCalledWith('/repo', 'main');
    expect(gitPrService.getBranchSyncStatus).toHaveBeenCalledWith('/repo', 'feat/test', 'main');
  });

  it('should use worktree path when worktree exists', async () => {
    vi.mocked(worktreeService.exists).mockResolvedValue(true);
    vi.mocked(worktreeService.getWorktreePath).mockReturnValue('/repo/.worktrees/feat-test');

    await useCase.execute('feat-123');

    expect(gitPrService.syncMain).toHaveBeenCalledWith('/repo/.worktrees/feat-test', 'main');
    expect(gitPrService.getBranchSyncStatus).toHaveBeenCalledWith(
      '/repo/.worktrees/feat-test',
      'feat/test',
      'main'
    );
  });

  it('should throw when feature not found', async () => {
    vi.mocked(featureRepo.findById).mockResolvedValue(null);
    vi.mocked(featureRepo.findByIdPrefix).mockResolvedValue(null);

    await expect(useCase.execute('nonexistent')).rejects.toThrow('Feature not found');
  });

  it('should throw when feature has no branch', async () => {
    vi.mocked(featureRepo.findById).mockResolvedValue({ ...mockFeature, branch: '' });

    await expect(useCase.execute('feat-123')).rejects.toThrow('has no branch');
  });

  it('should throw when repository has no remote', async () => {
    vi.mocked(gitPrService.hasRemote).mockResolvedValue(false);

    await expect(useCase.execute('feat-123')).rejects.toThrow('Repository has no remote');
    expect(gitPrService.syncMain).not.toHaveBeenCalled();
    expect(gitPrService.getBranchSyncStatus).not.toHaveBeenCalled();
  });

  it('should fall back to findByIdPrefix', async () => {
    vi.mocked(featureRepo.findById).mockResolvedValue(null);
    vi.mocked(featureRepo.findByIdPrefix).mockResolvedValue(mockFeature);

    const result = await useCase.execute('feat');
    expect(result.baseBranch).toBe('main');
  });
});
