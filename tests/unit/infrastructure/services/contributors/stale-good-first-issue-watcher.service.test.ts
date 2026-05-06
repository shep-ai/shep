/**
 * Integration tests for the stale-good-first-issue watcher.
 *
 * Asserts that the watcher dispatches `DetectStaleGoodFirstIssueUseCase`
 * once per connected repository on the configured interval, fans out
 * via `Promise.allSettled`-style isolation (a single repo failure does
 * not block siblings), and surfaces results via `IDesktopNotifier`.
 */

import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import {
  StaleGoodFirstIssueWatcherService,
  initializeStaleGoodFirstIssueWatcher,
  getStaleGoodFirstIssueWatcher,
  hasStaleGoodFirstIssueWatcher,
  resetStaleGoodFirstIssueWatcher,
} from '@/infrastructure/services/contributors/stale-good-first-issue-watcher.service.js';
import type { IDesktopNotifier } from '@/application/ports/output/services/i-desktop-notifier.js';
import type { IRepositoryRepository } from '@/application/ports/output/repositories/repository-repository.interface.js';
import type { IGitHubRepositoryService } from '@/application/ports/output/services/github-repository-service.interface.js';
import type { Repository } from '@/domain/generated/output.js';
import type { DetectStaleGoodFirstIssueUseCase } from '@/application/use-cases/contributors/detect-stale-good-first-issue.use-case.js';

function makeRepoRow(overrides: Partial<Repository>): Repository {
  return {
    id: overrides.id ?? 'repo-1',
    name: overrides.name ?? 'shep',
    path: overrides.path ?? '/tmp/shep',
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

function makeMockNotifier(): IDesktopNotifier {
  return { send: vi.fn() } as unknown as IDesktopNotifier;
}

function makeMockUseCase(): DetectStaleGoodFirstIssueUseCase {
  return { execute: vi.fn() } as unknown as DetectStaleGoodFirstIssueUseCase;
}

describe('StaleGoodFirstIssueWatcherService', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    resetStaleGoodFirstIssueWatcher();
  });

  it('dispatches the use case for each connected repo with a remoteUrl', async () => {
    const repos = [
      makeRepoRow({ id: 'r1', remoteUrl: 'https://github.com/shep-ai/shep' }),
      makeRepoRow({ id: 'r2', remoteUrl: 'https://github.com/shep-ai/other' }),
      makeRepoRow({ id: 'r3', remoteUrl: undefined }),
    ];
    const repoRepo = makeMockRepositoryRepo(repos);
    const ghService = makeMockGitHubService();
    const notifier = makeMockNotifier();
    const useCase = makeMockUseCase();
    vi.mocked(useCase.execute).mockResolvedValue({ thresholdDays: 30, stale: [] });

    const watcher = new StaleGoodFirstIssueWatcherService(
      useCase,
      repoRepo,
      ghService,
      notifier,
      1000
    );
    watcher.start();
    await vi.advanceTimersByTimeAsync(0);

    expect(useCase.execute).toHaveBeenCalledTimes(2);
    expect(useCase.execute).toHaveBeenCalledWith(
      expect.objectContaining({ owner: 'shep-ai', repo: 'shep' })
    );
    expect(useCase.execute).toHaveBeenCalledWith(
      expect.objectContaining({ owner: 'shep-ai', repo: 'other' })
    );
    watcher.stop();
  });

  it('invokes the notifier when stale issues are found', async () => {
    const repoRepo = makeMockRepositoryRepo([
      makeRepoRow({ remoteUrl: 'https://github.com/owner/repo' }),
    ]);
    const ghService = makeMockGitHubService();
    const notifier = makeMockNotifier();
    const useCase = makeMockUseCase();
    vi.mocked(useCase.execute).mockResolvedValue({
      thresholdDays: 30,
      stale: [
        {
          owner: 'owner',
          repo: 'repo',
          issueNumber: 1,
          title: 'old',
          url: 'u',
          lastActivityAt: '2026-01-01T00:00:00Z',
          staleForDays: 100,
        },
      ],
    });

    const watcher = new StaleGoodFirstIssueWatcherService(
      useCase,
      repoRepo,
      ghService,
      notifier,
      1000
    );
    watcher.start();
    await vi.advanceTimersByTimeAsync(0);

    expect(notifier.send).toHaveBeenCalledTimes(1);
    watcher.stop();
  });

  it('continues after a per-repo failure', async () => {
    const repoRepo = makeMockRepositoryRepo([
      makeRepoRow({ id: 'r1', remoteUrl: 'https://github.com/a/x' }),
      makeRepoRow({ id: 'r2', remoteUrl: 'https://github.com/b/y' }),
    ]);
    const ghService = makeMockGitHubService();
    const notifier = makeMockNotifier();
    const useCase = makeMockUseCase();
    vi.mocked(useCase.execute)
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce({ thresholdDays: 30, stale: [] });

    const watcher = new StaleGoodFirstIssueWatcherService(
      useCase,
      repoRepo,
      ghService,
      notifier,
      1000
    );
    watcher.start();
    await vi.advanceTimersByTimeAsync(0);

    expect(useCase.execute).toHaveBeenCalledTimes(2);
    watcher.stop();
  });

  it('polls again on the configured interval', async () => {
    const repoRepo = makeMockRepositoryRepo([makeRepoRow({ remoteUrl: 'https://github.com/a/x' })]);
    const ghService = makeMockGitHubService();
    const useCase = makeMockUseCase();
    vi.mocked(useCase.execute).mockResolvedValue({ thresholdDays: 30, stale: [] });

    const watcher = new StaleGoodFirstIssueWatcherService(
      useCase,
      repoRepo,
      ghService,
      makeMockNotifier(),
      1000
    );
    watcher.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(useCase.execute).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1000);
    expect(useCase.execute).toHaveBeenCalledTimes(2);
    watcher.stop();
  });
});

describe('Stale good-first-issue watcher singleton', () => {
  afterEach(() => {
    resetStaleGoodFirstIssueWatcher();
  });

  it('is uninitialized initially', () => {
    expect(hasStaleGoodFirstIssueWatcher()).toBe(false);
  });

  it('initializes once', () => {
    initializeStaleGoodFirstIssueWatcher(
      makeMockUseCase(),
      makeMockRepositoryRepo([]),
      makeMockGitHubService(),
      makeMockNotifier()
    );
    expect(hasStaleGoodFirstIssueWatcher()).toBe(true);
    expect(getStaleGoodFirstIssueWatcher()).toBeInstanceOf(StaleGoodFirstIssueWatcherService);
  });

  it('throws on double init', () => {
    initializeStaleGoodFirstIssueWatcher(
      makeMockUseCase(),
      makeMockRepositoryRepo([]),
      makeMockGitHubService(),
      makeMockNotifier()
    );
    expect(() =>
      initializeStaleGoodFirstIssueWatcher(
        makeMockUseCase(),
        makeMockRepositoryRepo([]),
        makeMockGitHubService(),
        makeMockNotifier()
      )
    ).toThrow(/already initialized/i);
  });
});
