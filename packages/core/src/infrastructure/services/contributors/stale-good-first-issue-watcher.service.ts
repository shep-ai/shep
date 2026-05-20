/**
 * Stale Good-First-Issue Watcher Service
 *
 * Periodically polls every connected repository (with a `remoteUrl`)
 * and dispatches `DetectStaleGoodFirstIssueUseCase`. The use case is
 * pure — it returns the structured stale list — and the watcher's only
 * job is to feed it the right `(owner, repo)` tuples and surface
 * results via the desktop notifier so a maintainer notices.
 *
 * Time-driven side of spec 097, FR-42 (research decision 9). The split
 * with GitHub Actions is deliberate: webhook-driven workflows (welcome,
 * label-by-lane) live in `.github/workflows/`; cadence-driven workloads
 * run inside the Shep daemon so adopting projects without an always-on
 * Shep instance still get the inbound automation.
 */

import type { IRepositoryRepository } from '../../../application/ports/output/repositories/repository-repository.interface.js';
import type { IGitHubRepositoryService } from '../../../application/ports/output/services/github-repository-service.interface.js';
import type { IDesktopNotifier } from '../../../application/ports/output/services/i-desktop-notifier.js';
import type { DetectStaleGoodFirstIssueUseCase } from '../../../application/use-cases/contributors/detect-stale-good-first-issue.use-case.js';

export const DEFAULT_STALE_POLL_INTERVAL_MS = 24 * 60 * 60 * 1000;
const DEFAULT_STALE_DAYS = 30;

export class StaleGoodFirstIssueWatcherService {
  private readonly useCase: DetectStaleGoodFirstIssueUseCase;
  private readonly repositoryRepo: IRepositoryRepository;
  private readonly githubService: IGitHubRepositoryService;
  private readonly notifier: IDesktopNotifier;
  private readonly pollIntervalMs: number;
  private readonly staleDays: number;
  private intervalId: ReturnType<typeof setInterval> | null = null;

  constructor(
    useCase: DetectStaleGoodFirstIssueUseCase,
    repositoryRepo: IRepositoryRepository,
    githubService: IGitHubRepositoryService,
    notifier: IDesktopNotifier,
    pollIntervalMs: number = DEFAULT_STALE_POLL_INTERVAL_MS,
    staleDays: number = DEFAULT_STALE_DAYS
  ) {
    this.useCase = useCase;
    this.repositoryRepo = repositoryRepo;
    this.githubService = githubService;
    this.notifier = notifier;
    this.pollIntervalMs = pollIntervalMs;
    this.staleDays = staleDays;
  }

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

  private async poll(): Promise<void> {
    let repositories;
    try {
      repositories = await this.repositoryRepo.list();
    } catch {
      return;
    }

    for (const repo of repositories) {
      if (!repo.remoteUrl) continue;
      let parsed;
      try {
        parsed = this.githubService.parseGitHubUrl(repo.remoteUrl);
      } catch {
        continue;
      }
      try {
        const result = await this.useCase.execute({
          owner: parsed.owner,
          repo: parsed.repo,
          staleDays: this.staleDays,
        });
        if (result.stale.length > 0) {
          this.notifier.send(
            'Stale good-first-issues detected',
            `${result.stale.length} good-first-issue(s) in ${parsed.owner}/${parsed.repo} are over ${result.thresholdDays} days old.`
          );
        }
      } catch {
        // Per-repo failures are isolated; continue with other repos.
      }
    }
  }
}

let watcherInstance: StaleGoodFirstIssueWatcherService | null = null;

export function initializeStaleGoodFirstIssueWatcher(
  useCase: DetectStaleGoodFirstIssueUseCase,
  repositoryRepo: IRepositoryRepository,
  githubService: IGitHubRepositoryService,
  notifier: IDesktopNotifier,
  pollIntervalMs?: number,
  staleDays?: number
): void {
  if (watcherInstance !== null) {
    throw new Error('Stale good-first-issue watcher already initialized. Cannot re-initialize.');
  }
  watcherInstance = new StaleGoodFirstIssueWatcherService(
    useCase,
    repositoryRepo,
    githubService,
    notifier,
    pollIntervalMs,
    staleDays
  );
}

export function getStaleGoodFirstIssueWatcher(): StaleGoodFirstIssueWatcherService {
  if (watcherInstance === null) {
    throw new Error(
      'Stale good-first-issue watcher not initialized. Call initializeStaleGoodFirstIssueWatcher() during web server startup.'
    );
  }
  return watcherInstance;
}

export function hasStaleGoodFirstIssueWatcher(): boolean {
  return watcherInstance !== null;
}

export function resetStaleGoodFirstIssueWatcher(): void {
  if (watcherInstance !== null) {
    watcherInstance.stop();
  }
  watcherInstance = null;
}
