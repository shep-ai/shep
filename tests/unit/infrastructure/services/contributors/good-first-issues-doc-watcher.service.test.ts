import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import path from 'node:path';

import {
  GoodFirstIssuesDocWatcherService,
  initializeGoodFirstIssuesDocWatcher,
  getGoodFirstIssuesDocWatcher,
  hasGoodFirstIssuesDocWatcher,
  resetGoodFirstIssuesDocWatcher,
} from '@/infrastructure/services/contributors/good-first-issues-doc-watcher.service.js';
import type { IRepositoryRepository } from '@/application/ports/output/repositories/repository-repository.interface.js';
import type { IGitHubRepositoryService } from '@/application/ports/output/services/github-repository-service.interface.js';
import type { Repository } from '@/domain/generated/output.js';
import type { RegenerateGoodFirstIssuesDocUseCase } from '@/application/use-cases/contributors/regenerate-good-first-issues-doc.use-case.js';

const WORKSPACE_ROOT = '/workspace/shep';

function makeRepoRow(overrides: Partial<Repository>): Repository {
  return {
    id: overrides.id ?? 'repo-1',
    name: overrides.name ?? 'shep',
    path: overrides.path ?? WORKSPACE_ROOT,
    remoteUrl: overrides.remoteUrl,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as Repository;
}

function makeMockRepositoryRepo(rows: Repository[]): IRepositoryRepository {
  return {
    create: vi.fn(),
    findById: vi.fn(),
    findByPath: vi.fn(),
    findByPathIncludingDeleted: vi.fn(),
    findByRemoteUrl: vi.fn(),
    findByUpstreamUrl: vi.fn(),
    list: vi.fn().mockResolvedValue(rows),
    remove: vi.fn(),
    softDelete: vi.fn(),
    restore: vi.fn(),
    update: vi.fn(),
  };
}

function makeMockGitHubService(): IGitHubRepositoryService {
  return {
    parseGitHubUrl: vi.fn().mockImplementation((url: string) => {
      const match = /github\.com\/([^/]+)\/([^/.]+)/.exec(url);
      if (!match) throw new Error(`unparseable: ${url}`);
      return { owner: match[1], repo: match[2], nameWithOwner: `${match[1]}/${match[2]}` };
    }),
  } as unknown as IGitHubRepositoryService;
}

function makeMockUseCase(): RegenerateGoodFirstIssuesDocUseCase {
  return {
    execute: vi.fn().mockResolvedValue({ status: 'unchanged', issueCount: 0 }),
  } as unknown as RegenerateGoodFirstIssuesDocUseCase;
}

describe('GoodFirstIssuesDocWatcherService', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    resetGoodFirstIssuesDocWatcher();
  });

  it('dispatches the regeneration use case for each connected repo with a remoteUrl', async () => {
    const repoRepo = makeMockRepositoryRepo([
      makeRepoRow({
        id: 'r1',
        path: '/workspace/shep',
        remoteUrl: 'https://github.com/shep-ai/shep',
      }),
      makeRepoRow({
        id: 'r2',
        path: '/workspace/other',
        remoteUrl: 'https://github.com/shep-ai/other',
      }),
      makeRepoRow({ id: 'r3', remoteUrl: undefined }),
    ]);
    const ghService = makeMockGitHubService();
    const useCase = makeMockUseCase();

    const watcher = new GoodFirstIssuesDocWatcherService(
      useCase,
      repoRepo,
      ghService,
      WORKSPACE_ROOT,
      1000
    );
    watcher.start();
    await vi.advanceTimersByTimeAsync(0);

    expect(useCase.execute).toHaveBeenCalledTimes(2);
    expect(useCase.execute).toHaveBeenCalledWith({
      owner: 'shep-ai',
      repo: 'shep',
      docPath: path.join('/workspace/shep', 'GOOD_FIRST_ISSUES.md'),
    });
    expect(useCase.execute).toHaveBeenCalledWith({
      owner: 'shep-ai',
      repo: 'other',
      docPath: path.join('/workspace/other', 'GOOD_FIRST_ISSUES.md'),
    });
    watcher.stop();
  });

  it('continues after a per-repo regeneration failure', async () => {
    const repoRepo = makeMockRepositoryRepo([
      makeRepoRow({ id: 'r1', remoteUrl: 'https://github.com/a/x' }),
      makeRepoRow({ id: 'r2', remoteUrl: 'https://github.com/b/y' }),
    ]);
    const ghService = makeMockGitHubService();
    const useCase = makeMockUseCase();
    vi.mocked(useCase.execute)
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce({ status: 'unchanged', issueCount: 0 });

    const watcher = new GoodFirstIssuesDocWatcherService(
      useCase,
      repoRepo,
      ghService,
      WORKSPACE_ROOT,
      1000
    );
    watcher.start();
    await vi.advanceTimersByTimeAsync(0);

    expect(useCase.execute).toHaveBeenCalledTimes(2);
    watcher.stop();
  });

  it('polls again on the configured interval', async () => {
    const repoRepo = makeMockRepositoryRepo([makeRepoRow({ remoteUrl: 'https://github.com/a/x' })]);
    const watcher = new GoodFirstIssuesDocWatcherService(
      makeMockUseCase(),
      repoRepo,
      makeMockGitHubService(),
      WORKSPACE_ROOT,
      1000
    );
    watcher.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(repoRepo.list).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1000);
    expect(repoRepo.list).toHaveBeenCalledTimes(2);
    watcher.stop();
  });
});

describe('Good-first-issues doc watcher singleton', () => {
  afterEach(() => {
    resetGoodFirstIssuesDocWatcher();
  });

  it('is uninitialized initially', () => {
    expect(hasGoodFirstIssuesDocWatcher()).toBe(false);
  });

  it('initializes once', () => {
    initializeGoodFirstIssuesDocWatcher(
      makeMockUseCase(),
      makeMockRepositoryRepo([]),
      makeMockGitHubService(),
      WORKSPACE_ROOT
    );
    expect(hasGoodFirstIssuesDocWatcher()).toBe(true);
    expect(getGoodFirstIssuesDocWatcher()).toBeInstanceOf(GoodFirstIssuesDocWatcherService);
  });

  it('throws on double init', () => {
    initializeGoodFirstIssuesDocWatcher(
      makeMockUseCase(),
      makeMockRepositoryRepo([]),
      makeMockGitHubService(),
      WORKSPACE_ROOT
    );
    expect(() =>
      initializeGoodFirstIssuesDocWatcher(
        makeMockUseCase(),
        makeMockRepositoryRepo([]),
        makeMockGitHubService(),
        WORKSPACE_ROOT
      )
    ).toThrow(/already initialized/);
  });
});
