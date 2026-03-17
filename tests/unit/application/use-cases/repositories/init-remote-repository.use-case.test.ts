import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { InitRemoteRepositoryUseCase } from '@/application/use-cases/repositories/init-remote-repository.use-case.js';
import type { IGitPrService } from '@/application/ports/output/services/git-pr-service.interface.js';
import {
  GitPrError,
  GitPrErrorCode,
} from '@/application/ports/output/services/git-pr-service.interface.js';
import type { IToolInstallerService } from '@/application/ports/output/services/tool-installer.service.js';
import type { ToolInstallationStatus } from '@/domain/generated/output.js';

function createMockGitPrService(): IGitPrService {
  return {
    hasRemote: vi.fn().mockResolvedValue(false),
    getRemoteUrl: vi.fn().mockResolvedValue(null),
    createGitHubRepo: vi.fn().mockResolvedValue('https://github.com/user/my-project'),
    addRemote: vi.fn(),
    getDefaultBranch: vi.fn().mockResolvedValue('main'),
    revParse: vi.fn().mockResolvedValue('abc123'),
    hasUncommittedChanges: vi.fn().mockResolvedValue(false),
    commitAll: vi.fn(),
    push: vi.fn(),
    createPr: vi.fn(),
    mergePr: vi.fn(),
    mergeBranch: vi.fn(),
    getCiStatus: vi.fn(),
    watchCi: vi.fn(),
    deleteBranch: vi.fn(),
    getPrDiffSummary: vi.fn(),
    getFileDiffs: vi.fn(),
    listPrStatuses: vi.fn(),
    verifyMerge: vi.fn(),
    localMergeSquash: vi.fn(),
    getMergeableStatus: vi.fn(),
    getFailureLogs: vi.fn(),
  };
}

function createMockToolInstaller(): IToolInstallerService {
  return {
    checkAvailability: vi.fn().mockResolvedValue({
      status: 'available',
      toolName: 'gh',
    } satisfies ToolInstallationStatus),
    getInstallCommand: vi.fn().mockReturnValue(null),
    executeInstall: vi.fn(),
  };
}

describe('InitRemoteRepositoryUseCase', () => {
  let useCase: InitRemoteRepositoryUseCase;
  let mockGitPrService: IGitPrService;
  let mockToolInstaller: IToolInstallerService;

  beforeEach(() => {
    mockGitPrService = createMockGitPrService();
    mockToolInstaller = createMockToolInstaller();
    useCase = new InitRemoteRepositoryUseCase(mockGitPrService, mockToolInstaller);
  });

  it('should create a GitHub repo, returning url, name, and privacy', async () => {
    const result = await useCase.execute({ cwd: '/home/user/my-project' });

    expect(mockToolInstaller.checkAvailability).toHaveBeenCalledWith('gh');
    expect(mockGitPrService.hasRemote).toHaveBeenCalledWith('/home/user/my-project');
    expect(mockGitPrService.createGitHubRepo).toHaveBeenCalledWith(
      '/home/user/my-project',
      'my-project',
      { isPrivate: true, org: undefined }
    );
    expect(result).toEqual({
      repoUrl: 'https://github.com/user/my-project',
      repoName: 'my-project',
      isPrivate: true,
    });
  });

  it('should throw when gh CLI is not installed', async () => {
    vi.mocked(mockToolInstaller.checkAvailability).mockResolvedValue({
      status: 'missing',
      toolName: 'gh',
    });

    await expect(useCase.execute({ cwd: '/home/user/my-project' })).rejects.toThrow(GitPrError);
    await expect(useCase.execute({ cwd: '/home/user/my-project' })).rejects.toMatchObject({
      code: GitPrErrorCode.GH_NOT_FOUND,
    });
    expect(mockGitPrService.createGitHubRepo).not.toHaveBeenCalled();
  });

  it('should throw REMOTE_ALREADY_EXISTS when remote is already configured', async () => {
    vi.mocked(mockGitPrService.hasRemote).mockResolvedValue(true);

    await expect(useCase.execute({ cwd: '/home/user/my-project' })).rejects.toThrow(GitPrError);
    await expect(useCase.execute({ cwd: '/home/user/my-project' })).rejects.toMatchObject({
      code: GitPrErrorCode.REMOTE_ALREADY_EXISTS,
    });
    expect(mockGitPrService.createGitHubRepo).not.toHaveBeenCalled();
  });

  it('should propagate errors from createGitHubRepo', async () => {
    const error = new GitPrError('repo name taken', GitPrErrorCode.REPO_CREATE_FAILED);
    vi.mocked(mockGitPrService.createGitHubRepo).mockRejectedValue(error);

    await expect(useCase.execute({ cwd: '/home/user/my-project' })).rejects.toThrow(error);
  });

  it('should derive repo name from basename of cwd when name is not provided', async () => {
    await useCase.execute({ cwd: '/home/user/my-project' });

    expect(mockGitPrService.createGitHubRepo).toHaveBeenCalledWith(
      '/home/user/my-project',
      'my-project',
      expect.any(Object)
    );
  });

  it('should use custom name when provided', async () => {
    await useCase.execute({ cwd: '/home/user/my-project', name: 'custom-repo' });

    expect(mockGitPrService.createGitHubRepo).toHaveBeenCalledWith(
      '/home/user/my-project',
      'custom-repo',
      expect.any(Object)
    );
  });

  it('should pass org option through to createGitHubRepo', async () => {
    await useCase.execute({ cwd: '/home/user/my-project', org: 'myorg' });

    expect(mockGitPrService.createGitHubRepo).toHaveBeenCalledWith(
      '/home/user/my-project',
      'my-project',
      { isPrivate: true, org: 'myorg' }
    );
  });

  it('should pass isPrivate=false when isPublic is true', async () => {
    await useCase.execute({ cwd: '/home/user/my-project', isPublic: true });

    expect(mockGitPrService.createGitHubRepo).toHaveBeenCalledWith(
      '/home/user/my-project',
      'my-project',
      { isPrivate: false, org: undefined }
    );
  });

  it('should default to private when isPublic is not specified', async () => {
    await useCase.execute({ cwd: '/home/user/my-project' });

    expect(mockGitPrService.createGitHubRepo).toHaveBeenCalledWith(
      '/home/user/my-project',
      'my-project',
      { isPrivate: true, org: undefined }
    );
  });

  it('should handle Windows-style paths for basename extraction', async () => {
    await useCase.execute({ cwd: 'C:\\Users\\dev\\workspace\\api-server' });

    expect(mockGitPrService.createGitHubRepo).toHaveBeenCalledWith(
      'C:\\Users\\dev\\workspace\\api-server',
      'api-server',
      expect.any(Object)
    );
  });

  it('should include actionable message when gh CLI is missing', async () => {
    vi.mocked(mockToolInstaller.checkAvailability).mockResolvedValue({
      status: 'missing',
      toolName: 'gh',
    });

    await expect(useCase.execute({ cwd: '/home/user/my-project' })).rejects.toThrow(
      /gh CLI is not installed/i
    );
  });

  it('should include actionable message when remote already exists', async () => {
    vi.mocked(mockGitPrService.hasRemote).mockResolvedValue(true);

    await expect(useCase.execute({ cwd: '/home/user/my-project' })).rejects.toThrow(
      /remote.*already.*configured/i
    );
  });
});
