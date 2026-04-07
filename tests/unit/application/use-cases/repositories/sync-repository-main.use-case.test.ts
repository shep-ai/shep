import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SyncRepositoryMainUseCase } from '@/application/use-cases/repositories/sync-repository-main.use-case.js';
import type { IRepositoryRepository } from '@/application/ports/output/repositories/repository-repository.interface.js';
import type { IGitPrService } from '@/application/ports/output/services/git-pr-service.interface.js';
import {
  GitPrError,
  GitPrErrorCode,
} from '@/application/ports/output/services/git-pr-service.interface.js';
import type { Repository } from '@/domain/generated/output.js';

function createMockRepo(): IRepositoryRepository {
  return {
    create: vi.fn(),
    findById: vi.fn().mockResolvedValue(null),
    findByPath: vi.fn().mockResolvedValue(null),
    findByPathIncludingDeleted: vi.fn().mockResolvedValue(null),
    findByRemoteUrl: vi.fn().mockResolvedValue(null),
    findByUpstreamUrl: vi.fn().mockResolvedValue(null),
    list: vi.fn().mockResolvedValue([]),
    remove: vi.fn(),
    softDelete: vi.fn(),
    restore: vi.fn(),
    update: vi.fn(),
  };
}

function createMockGitPrService(): IGitPrService {
  return {
    getDefaultBranch: vi.fn().mockResolvedValue('main'),
    syncMain: vi.fn().mockResolvedValue(undefined),
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
    rebaseOnMain: vi.fn(),
    getConflictedFiles: vi.fn(),
    stageFiles: vi.fn(),
    rebaseContinue: vi.fn(),
    rebaseAbort: vi.fn(),
  } as unknown as IGitPrService;
}

const sampleRepo: Repository = {
  id: 'repo-abc-123',
  name: 'my-project',
  path: '/home/user/my-project',
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('SyncRepositoryMainUseCase', () => {
  let useCase: SyncRepositoryMainUseCase;
  let mockRepo: IRepositoryRepository;
  let mockGitPrService: IGitPrService;

  beforeEach(() => {
    vi.clearAllMocks();
    mockRepo = createMockRepo();
    mockGitPrService = createMockGitPrService();
    useCase = new SyncRepositoryMainUseCase(mockRepo, mockGitPrService);
  });

  it('should resolve repo and call syncMain with correct args', async () => {
    vi.mocked(mockRepo.findById).mockResolvedValue(sampleRepo);
    vi.mocked(mockGitPrService.getDefaultBranch).mockResolvedValue('main');

    await useCase.execute('repo-abc-123');

    expect(mockRepo.findById).toHaveBeenCalledWith('repo-abc-123');
    expect(mockGitPrService.getDefaultBranch).toHaveBeenCalledWith('/home/user/my-project');
    expect(mockGitPrService.syncMain).toHaveBeenCalledWith('/home/user/my-project', 'main');
  });

  it('should throw when repository not found', async () => {
    vi.mocked(mockRepo.findById).mockResolvedValue(null);

    await expect(useCase.execute('non-existent')).rejects.toThrow(
      'Repository not found: "non-existent"'
    );

    expect(mockGitPrService.syncMain).not.toHaveBeenCalled();
  });

  it('should propagate SYNC_FAILED error from syncMain', async () => {
    vi.mocked(mockRepo.findById).mockResolvedValue(sampleRepo);
    vi.mocked(mockGitPrService.getDefaultBranch).mockResolvedValue('main');
    vi.mocked(mockGitPrService.syncMain).mockRejectedValue(
      new GitPrError('Cannot fast-forward', GitPrErrorCode.SYNC_FAILED)
    );

    const error = await useCase.execute('repo-abc-123').catch((e) => e);

    expect(error).toBeInstanceOf(GitPrError);
    expect(error.code).toBe(GitPrErrorCode.SYNC_FAILED);
  });

  it('should use the detected default branch name', async () => {
    vi.mocked(mockRepo.findById).mockResolvedValue(sampleRepo);
    vi.mocked(mockGitPrService.getDefaultBranch).mockResolvedValue('develop');

    await useCase.execute('repo-abc-123');

    expect(mockGitPrService.syncMain).toHaveBeenCalledWith('/home/user/my-project', 'develop');
  });
});
