/**
 * Good First Issues Doc Watcher Service
 *
 * Daily cadence companion for the contributor pipeline. It regenerates the
 * checked-in GOOD_FIRST_ISSUES.md bucket region from live GitHub labels via
 * RegenerateGoodFirstIssuesDocUseCase. The use case gates writes, so this
 * watcher only discovers repositories and supplies the doc path.
 */

import path from 'node:path';

import type { IRepositoryRepository } from '../../../application/ports/output/repositories/repository-repository.interface.js';
import type { IGitHubRepositoryService } from '../../../application/ports/output/services/github-repository-service.interface.js';
import type { RegenerateGoodFirstIssuesDocUseCase } from '../../../application/use-cases/contributors/regenerate-good-first-issues-doc.use-case.js';

export const DEFAULT_GOOD_FIRST_ISSUES_DOC_POLL_INTERVAL_MS = 24 * 60 * 60 * 1000;

export class GoodFirstIssuesDocWatcherService {
  private intervalId: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly useCase: RegenerateGoodFirstIssuesDocUseCase,
    private readonly repositoryRepo: IRepositoryRepository,
    private readonly githubService: IGitHubRepositoryService,
    private readonly workspaceRoot: string,
    private readonly pollIntervalMs: number = DEFAULT_GOOD_FIRST_ISSUES_DOC_POLL_INTERVAL_MS
  ) {}

  isRunning(): boolean {
    return this.intervalId !== null;
  }

  start(): void {
    if (this.intervalId !== null) return;
    void this.poll();
    this.intervalId = setInterval(() => {
      void this.poll();
    }, this.pollIntervalMs);
  }

  stop(): void {
    if (this.intervalId !== null) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  /** Exposed for tests and manual trigger callers. */
  async poll(): Promise<void> {
    let repositories;
    try {
      repositories = await this.repositoryRepo.list();
    } catch {
      return;
    }

    for (const repo of repositories) {
      if (!repo.remoteUrl) continue;
      const docPath = path.join(repo.path || this.workspaceRoot, 'GOOD_FIRST_ISSUES.md');
      let parsed;
      try {
        parsed = this.githubService.parseGitHubUrl(repo.remoteUrl);
      } catch {
        continue;
      }
      try {
        await this.useCase.execute({
          owner: parsed.owner,
          repo: parsed.repo,
          docPath,
        });
      } catch {
        // Per-repo failures are isolated; continue with other repos.
      }
    }
  }
}

let watcherInstance: GoodFirstIssuesDocWatcherService | null = null;

export function initializeGoodFirstIssuesDocWatcher(
  useCase: RegenerateGoodFirstIssuesDocUseCase,
  repositoryRepo: IRepositoryRepository,
  githubService: IGitHubRepositoryService,
  workspaceRoot: string,
  pollIntervalMs?: number
): void {
  if (watcherInstance !== null) {
    throw new Error('Good-first-issues doc watcher already initialized. Cannot re-initialize.');
  }
  watcherInstance = new GoodFirstIssuesDocWatcherService(
    useCase,
    repositoryRepo,
    githubService,
    workspaceRoot,
    pollIntervalMs
  );
}

export function getGoodFirstIssuesDocWatcher(): GoodFirstIssuesDocWatcherService {
  if (watcherInstance === null) {
    throw new Error(
      'Good-first-issues doc watcher not initialized. Call initializeGoodFirstIssuesDocWatcher() during web server startup.'
    );
  }
  return watcherInstance;
}

export function hasGoodFirstIssuesDocWatcher(): boolean {
  return watcherInstance !== null;
}

export function resetGoodFirstIssuesDocWatcher(): void {
  if (watcherInstance !== null) {
    watcherInstance.stop();
  }
  watcherInstance = null;
}
