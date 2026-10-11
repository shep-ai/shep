/**
 * PR Sync Watcher Service
 *
 * Polls GitHub PR status and CI status for features in the Review lifecycle
 * stage, and upstream PR status for features in the AwaitingUpstream stage,
 * updating feature records and emitting notifications when transitions
 * are detected. Follows the NotificationWatcherService polling pattern.
 *
 * Maintains in-memory tracking of last-known PR and CI status per feature
 * to avoid duplicate updates and notifications. Features are grouped by
 * repositoryPath for batch `gh pr list` queries.
 */

import type { Feature, NotificationEvent } from '../../../domain/generated/output.js';
import {
  SdlcLifecycle,
  PrStatus,
  CiStatus,
  AgentRunStatus,
  NotificationEventType,
  NotificationSeverity,
} from '../../../domain/generated/output.js';
import type { IFeatureRepository } from '../../../application/ports/output/repositories/feature-repository.interface.js';
import type { IAgentRunRepository } from '../../../application/ports/output/agents/agent-run-repository.interface.js';
import type { IGitPrService } from '../../../application/ports/output/services/git-pr-service.interface.js';
import type {
  CiStatusResult,
  PrStatusInfo,
} from '../../../application/ports/output/services/git-pr-service.interface.js';
import type { INotificationService } from '../../../application/ports/output/services/notification-service.interface.js';
import type { IGitForkService } from '../../../application/ports/output/services/git-fork-service.interface.js';
import type Database from 'better-sqlite3';
import type { ILogger } from '../../../application/ports/output/services/logger.interface.js';
import { ConsoleLogger } from '../logging/console-logger.js';
import type { ITelemetry } from '../../../application/ports/output/services/telemetry.interface.js';
import { NoopTelemetry } from '../telemetry/noop-telemetry.js';
import { recordPrMerged } from '../telemetry/pr-telemetry.js';

const DEFAULT_POLL_INTERVAL_MS = 30_000;
const LOCK_TTL_MS = 60_000;
const RATE_LIMIT_BACKOFF_MS = 5 * 60_000;
const TAG = '[PrSyncWatcher]';

interface PrWatcherState {
  prStatus: PrStatus;
  ciStatus: CiStatus | undefined;
  mergeable: boolean | undefined;
  featureName: string;
  unchangedCycles: number;
}

const CI_STATUS_MAP: Record<string, CiStatus> = {
  success: CiStatus.Success,
  failure: CiStatus.Failure,
  pending: CiStatus.Pending,
};

export class PrSyncWatcherService {
  private readonly featureRepo: IFeatureRepository;
  private readonly agentRunRepo: IAgentRunRepository;
  private readonly gitPrService: IGitPrService;
  private readonly notificationService: INotificationService;
  private readonly gitForkService: IGitForkService | null;
  private readonly logger: ILogger;
  private readonly telemetry: ITelemetry;
  private readonly pollIntervalMs: number;
  private readonly trackedFeatures = new Map<string, PrWatcherState>();
  private readonly skippedRepos = new Set<string>();
  private readonly rateLimitedUntil = new Map<string, number>();
  private readonly db: Database.Database | null;
  private readonly processId: string;
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private pollCycle = 0;

  constructor(
    featureRepo: IFeatureRepository,
    agentRunRepo: IAgentRunRepository,
    gitPrService: IGitPrService,
    notificationService: INotificationService,
    pollIntervalMs: number = DEFAULT_POLL_INTERVAL_MS,
    db: Database.Database | null = null,
    gitForkService: IGitForkService | null = null,
    /**
     * Where this watcher's output goes. It ran inside the daemon and wrote
     * straight to `console.*` with a per-line `no-console` suppression on
     * each of 17 calls, so its output could not be levelled, filtered or
     * redacted. Defaults to a ConsoleLogger so existing callers are
     * unaffected; DI passes the container's ILogger.
     */
    logger: ILogger = new ConsoleLogger(),
    /** Records pr.merged (spec 133); once-keyed, so other detectors cannot double-count. */
    telemetry: ITelemetry = new NoopTelemetry()
  ) {
    this.telemetry = telemetry;
    this.featureRepo = featureRepo;
    this.agentRunRepo = agentRunRepo;
    this.gitPrService = gitPrService;
    this.notificationService = notificationService;
    this.gitForkService = gitForkService;
    this.logger = logger;
    this.pollIntervalMs = pollIntervalMs;
    this.db = db;
    this.processId = `${process.pid}-${Date.now()}`;
  }

  isRunning(): boolean {
    return this.intervalId !== null;
  }

  start(): void {
    if (this.intervalId !== null) return;

    this.logger.info(`${TAG} Starting (poll every ${this.pollIntervalMs}ms)`);

    // Run first poll immediately
    void this.poll();

    this.intervalId = setInterval(() => {
      void this.poll();
    }, this.pollIntervalMs);
  }

  stop(): void {
    if (this.intervalId !== null) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      this.logger.info(`${TAG} Stopped`);
    }
  }

  /** Attempt to acquire the cross-process poll lock. Returns true if acquired. */
  private tryAcquireLock(): boolean {
    if (!this.db) return true; // no DB → single-process mode, always proceed

    const now = Date.now();
    const expiresAt = now + LOCK_TTL_MS;

    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO pr_sync_lock (id, locked_by, locked_at, expires_at)
      SELECT 1, ?, ?, ?
      WHERE NOT EXISTS (
        SELECT 1 FROM pr_sync_lock WHERE id = 1 AND locked_by != ? AND expires_at > ?
      )
    `);
    const result = stmt.run(this.processId, now, expiresAt, this.processId, now);
    return result.changes > 0;
  }

  /** Check if a feature should be polled this cycle based on its unchanged cycles count. */
  private shouldPollFeature(featureId: string): boolean {
    const tracked = this.trackedFeatures.get(featureId);
    if (!tracked) return true; // new feature, always poll

    const uc = tracked.unchangedCycles;
    if (uc <= 2) return true; // poll every cycle
    if (uc <= 5) return this.pollCycle % 2 === 0; // poll every 2nd cycle
    return this.pollCycle % 4 === 0; // poll every 4th cycle
  }

  private async poll(): Promise<void> {
    try {
      if (!this.tryAcquireLock()) {
        return; // another process holds the lock — skip this cycle
      }

      this.pollCycle++;

      const allReviewFeatures = await this.featureRepo.list({ lifecycle: SdlcLifecycle.Review });

      // Include features with a valid repositoryPath (with or without PR data)
      const reviewFeatures = allReviewFeatures.filter((f) => f.repositoryPath);

      // Group Review features by repositoryPath for batch queries
      const byRepo = new Map<string, Feature[]>();
      for (const feature of reviewFeatures) {
        const group = byRepo.get(feature.repositoryPath) ?? [];
        group.push(feature);
        byRepo.set(feature.repositoryPath, group);
      }

      // Process each repository (Review features)
      for (const [repoPath, repoFeatures] of byRepo) {
        await this.processRepository(repoPath, repoFeatures);
      }

      // Process AwaitingUpstream features (poll upstream PR status individually)
      const awaitingFeatures = await this.featureRepo.list({
        lifecycle: SdlcLifecycle.AwaitingUpstream,
      });
      for (const feature of awaitingFeatures) {
        await this.processAwaitingUpstreamFeature(feature);
      }

      // Prune features no longer in Review or AwaitingUpstream
      const currentFeatureIds = new Set([
        ...reviewFeatures.map((f) => f.id),
        ...awaitingFeatures.map((f) => f.id),
      ]);
      for (const trackedId of this.trackedFeatures.keys()) {
        if (!currentFeatureIds.has(trackedId)) {
          this.trackedFeatures.delete(trackedId);
        }
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.warn(`${TAG} Poll failed: ${msg}`);
    }
  }

  private isRateLimited(repoPath: string): boolean {
    const until = this.rateLimitedUntil.get(repoPath);
    if (until === undefined) return false;
    if (Date.now() >= until) {
      this.rateLimitedUntil.delete(repoPath);
      this.logger.info(`${TAG} Rate limit backoff expired for ${repoPath}`);
      return false;
    }
    return true;
  }

  private handleRateLimitError(repoPath: string, error: Error): void {
    const msg = error.message;
    if (msg.includes('API rate limit exceeded') || msg.includes('rate limit')) {
      const backoffUntil = Date.now() + RATE_LIMIT_BACKOFF_MS;
      this.rateLimitedUntil.set(repoPath, backoffUntil);
      this.logger.warn(
        `${TAG} Rate limited for ${repoPath}, backing off until ${new Date(backoffUntil).toISOString()}`
      );
    }
  }

  private async processRepository(repoPath: string, features: Feature[]): Promise<void> {
    if (this.skippedRepos.has(repoPath)) return;
    if (this.isRateLimited(repoPath)) return;

    // Skip repos without a git remote — gh pr list will always fail
    try {
      if (!(await this.gitPrService.hasRemote(repoPath))) {
        this.logger.info(`${TAG} Skipping ${repoPath} (no git remote)`);
        this.skippedRepos.add(repoPath);
        return;
      }
    } catch {
      return;
    }

    let prStatuses: PrStatusInfo[];
    try {
      prStatuses = await this.gitPrService.listPrStatuses(repoPath);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      if (error instanceof Error) this.handleRateLimitError(repoPath, error);
      this.logger.warn(`${TAG} listPrStatuses failed for ${repoPath}: ${msg}`);
      return;
    }

    // Build lookups by PR number and by head branch name.
    // Multiple PRs can share the same headRefName (e.g. old merged PR + new open PR).
    // Prefer Open PRs so we don't match stale merged/closed ones.
    const statusByNumber = new Map<number, PrStatusInfo>();
    const statusByBranch = new Map<string, PrStatusInfo>();
    for (const pr of prStatuses) {
      statusByNumber.set(pr.number, pr);
      if (pr.headRefName) {
        const existing = statusByBranch.get(pr.headRefName);
        if (!existing || (existing.state !== PrStatus.Open && pr.state === PrStatus.Open)) {
          statusByBranch.set(pr.headRefName, pr);
        }
      }
    }

    for (const feature of features) {
      await this.processFeature(feature, statusByNumber, statusByBranch);
    }
  }

  private async processFeature(
    feature: Feature,
    statusByNumber: Map<number, PrStatusInfo>,
    statusByBranch: Map<string, PrStatusInfo>
  ): Promise<void> {
    // If feature has no PR data, try to discover an Open PR by matching branch name.
    // Only link Open PRs — merged/closed PRs with the same branch are likely stale
    // from a previous iteration. The watcher will catch Open→Merged transitions
    // on subsequent polls once the PR is linked.
    if (!feature.pr) {
      const matchedPr = statusByBranch.get(feature.branch);
      if (matchedPr?.state !== PrStatus.Open) return;

      this.logger.info(
        `${TAG} Discovered PR #${matchedPr.number} for "${feature.name}" via branch "${feature.branch}"`
      );

      feature.pr = {
        url: matchedPr.url,
        number: matchedPr.number,
        status: PrStatus.Open,
      };

      this.trackedFeatures.set(feature.id, {
        prStatus: PrStatus.Open,
        ciStatus: undefined,
        mergeable: undefined,
        featureName: feature.name,
        unchangedCycles: 0,
      });

      await this.featureRepo.update(feature);
      return;
    }

    // Check exponential backoff — skip features that haven't changed recently
    if (!this.shouldPollFeature(feature.id)) {
      return;
    }

    const pr = feature.pr;
    const prStatusInfo = statusByNumber.get(pr.number);

    let needsUpdate = false;

    // Initialize or retrieve tracked state
    const prevState = this.trackedFeatures.get(feature.id);
    if (!prevState) {
      // First time seeing this feature — initialize tracking
      this.trackedFeatures.set(feature.id, {
        prStatus: pr.status,
        ciStatus: pr.ciStatus,
        mergeable: pr.mergeable,
        featureName: feature.name,
        unchangedCycles: 0,
      });
    }

    const tracked = this.trackedFeatures.get(feature.id)!;

    // Check PR status transition
    if (prStatusInfo && prStatusInfo.state !== tracked.prStatus) {
      const newPrStatus = prStatusInfo.state;

      this.logger.info(
        `${TAG} PR #${pr.number} status changed: ${tracked.prStatus} -> ${newPrStatus} for "${feature.name}"`
      );

      feature.pr = { ...pr, status: newPrStatus };

      if (newPrStatus === PrStatus.Merged) {
        recordPrMerged(this.telemetry, feature, true);
        // Re-fetch to avoid racing with the merge node which may have already
        // transitioned this feature to Maintain and performed cleanup.
        const freshFeature = await this.featureRepo.findById(feature.id);
        if (freshFeature?.lifecycle === SdlcLifecycle.Maintain) {
          this.logger.info(
            `${TAG} Feature "${feature.name}" already in Maintain — skipping duplicate transition`
          );
          tracked.prStatus = newPrStatus;
          // Still update the PR status on the record so it reflects Merged
          feature.pr = { ...(freshFeature.pr ?? pr), status: PrStatus.Merged };
          await this.featureRepo.update({ ...freshFeature, pr: feature.pr, updatedAt: new Date() });
          return;
        }
        feature.lifecycle = SdlcLifecycle.Maintain;
        await this.completeAgentRun(feature);

        this.emitNotification(
          NotificationEventType.PrMerged,
          feature.id,
          feature.agentRunId ?? '',
          feature.name,
          `PR #${pr.number} merged for ${feature.name}`,
          NotificationSeverity.Success
        );
      } else if (newPrStatus === PrStatus.Closed) {
        this.emitNotification(
          NotificationEventType.PrClosed,
          feature.id,
          feature.agentRunId ?? '',
          feature.name,
          `PR #${pr.number} closed for ${feature.name}`,
          NotificationSeverity.Warning
        );
      }

      tracked.prStatus = newPrStatus;
      needsUpdate = true;
    }

    // Check mergeable status transition (from batch query data)
    if (prStatusInfo?.mergeable !== undefined) {
      const newMergeable = prStatusInfo.mergeable;
      if (newMergeable !== tracked.mergeable) {
        this.logger.info(
          `${TAG} Mergeable status changed: ${tracked.mergeable ?? 'unknown'} -> ${newMergeable} for "${feature.name}"`
        );

        feature.pr = { ...(feature.pr ?? pr), mergeable: newMergeable };

        if (newMergeable === false) {
          this.emitNotification(
            NotificationEventType.PrBlocked,
            feature.id,
            feature.agentRunId ?? '',
            feature.name,
            `PR #${pr.number} has merge conflicts for ${feature.name}`,
            NotificationSeverity.Warning
          );
        }

        tracked.mergeable = newMergeable;
        needsUpdate = true;
      }
    }

    // Check CI status transition
    try {
      const ciResult: CiStatusResult = await this.gitPrService.getCiStatus(
        feature.repositoryPath,
        feature.branch
      );
      const newCiStatus = CI_STATUS_MAP[ciResult.status] ?? CiStatus.Pending;

      if (newCiStatus !== tracked.ciStatus) {
        this.logger.info(
          `${TAG} CI status changed: ${tracked.ciStatus ?? 'none'} -> ${newCiStatus} for "${feature.name}"`
        );

        feature.pr = { ...(feature.pr ?? pr), ciStatus: newCiStatus };

        if (newCiStatus === CiStatus.Success) {
          this.emitNotification(
            NotificationEventType.PrChecksPassed,
            feature.id,
            feature.agentRunId ?? '',
            feature.name,
            `CI checks passed for ${feature.name}`,
            NotificationSeverity.Success
          );
        } else if (newCiStatus === CiStatus.Failure) {
          this.emitNotification(
            NotificationEventType.PrChecksFailed,
            feature.id,
            feature.agentRunId ?? '',
            feature.name,
            `CI checks failed for ${feature.name}`,
            NotificationSeverity.Error
          );
        }

        tracked.ciStatus = newCiStatus;
        needsUpdate = true;
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      if (error instanceof Error) this.handleRateLimitError(feature.repositoryPath, error);
      this.logger.warn(`${TAG} getCiStatus failed for "${feature.name}": ${msg}`);
    }

    if (needsUpdate) {
      tracked.unchangedCycles = 0;
      await this.featureRepo.update(feature);
    } else {
      tracked.unchangedCycles++;
    }
  }

  /**
   * Extract upstream repo (owner/name) from an upstream PR URL.
   * Expected format: https://github.com/owner/repo/pull/123
   */
  private extractUpstreamRepo(upstreamPrUrl: string): string | null {
    const match = upstreamPrUrl.match(/github\.com\/([^/]+\/[^/]+)\/pull\//);
    return match?.[1] ?? null;
  }

  /**
   * Poll upstream PR status for a feature in AwaitingUpstream lifecycle.
   * If the upstream PR is merged, transition to Maintain.
   * If the upstream PR is closed, update upstreamPrStatus to Closed.
   */
  private async processAwaitingUpstreamFeature(feature: Feature): Promise<void> {
    if (!this.gitForkService) return;
    if (!feature.pr?.upstreamPrUrl || !feature.pr?.upstreamPrNumber) return;

    // Check exponential backoff — skip features that haven't changed recently
    if (!this.shouldPollFeature(feature.id)) {
      return;
    }

    const upstreamRepo = this.extractUpstreamRepo(feature.pr.upstreamPrUrl);
    if (!upstreamRepo) {
      this.logger.warn(
        `${TAG} Could not extract upstream repo from URL: ${feature.pr.upstreamPrUrl}`
      );
      return;
    }

    let upstreamStatus: PrStatus;
    try {
      upstreamStatus = await this.gitForkService.getUpstreamPrStatus(
        upstreamRepo,
        feature.pr.upstreamPrNumber
      );
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `${TAG} getUpstreamPrStatus failed for "${feature.name}" (${upstreamRepo}#${feature.pr.upstreamPrNumber}): ${msg}`
      );
      return;
    }

    // Initialize tracking if needed
    const prevState = this.trackedFeatures.get(feature.id);
    if (!prevState) {
      this.trackedFeatures.set(feature.id, {
        prStatus: feature.pr.upstreamPrStatus ?? PrStatus.Open,
        ciStatus: undefined,
        mergeable: undefined,
        featureName: feature.name,
        unchangedCycles: 0,
      });
    }

    const tracked = this.trackedFeatures.get(feature.id)!;
    const previousStatus = tracked.prStatus;

    if (upstreamStatus === previousStatus) {
      tracked.unchangedCycles++;
      return;
    }

    this.logger.info(
      `${TAG} Upstream PR #${feature.pr.upstreamPrNumber} status changed: ${previousStatus} -> ${upstreamStatus} for "${feature.name}"`
    );

    tracked.prStatus = upstreamStatus;
    tracked.unchangedCycles = 0;

    if (upstreamStatus === PrStatus.Merged) {
      recordPrMerged(this.telemetry, feature, true);
      feature.lifecycle = SdlcLifecycle.Maintain;
      feature.pr = { ...feature.pr, upstreamPrStatus: PrStatus.Merged };
      feature.updatedAt = new Date();
      await this.featureRepo.update(feature);
      await this.completeAgentRun(feature);

      this.emitNotification(
        NotificationEventType.PrMerged,
        feature.id,
        feature.agentRunId ?? '',
        feature.name,
        `Upstream PR #${feature.pr.upstreamPrNumber} merged for ${feature.name}`,
        NotificationSeverity.Success
      );
    } else if (upstreamStatus === PrStatus.Closed) {
      feature.pr = { ...feature.pr, upstreamPrStatus: PrStatus.Closed };
      feature.updatedAt = new Date();
      await this.featureRepo.update(feature);

      this.emitNotification(
        NotificationEventType.PrClosed,
        feature.id,
        feature.agentRunId ?? '',
        feature.name,
        `Upstream PR #${feature.pr.upstreamPrNumber} closed for ${feature.name}`,
        NotificationSeverity.Warning
      );
    }
  }

  /** Mark associated agent run as completed so the UI reflects "done" state. */
  private async completeAgentRun(feature: Feature): Promise<void> {
    if (!feature.agentRunId) return;
    try {
      await this.agentRunRepo.updateStatus(feature.agentRunId, AgentRunStatus.completed);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.warn(`${TAG} Failed to complete agent run ${feature.agentRunId}: ${msg}`);
    }
  }

  private emitNotification(
    eventType: NotificationEventType,
    featureId: string,
    agentRunId: string,
    featureName: string,
    message: string,
    severity: NotificationSeverity
  ): void {
    const event: NotificationEvent = {
      eventType,
      featureId,
      agentRunId,
      featureName,
      message,
      severity,
      timestamp: new Date().toISOString(),
    };

    this.notificationService.notify(event);
  }
}

// --- Singleton accessors (follows NotificationWatcherService pattern) ---

let watcherInstance: PrSyncWatcherService | null = null;

/**
 * Initialize the PR sync watcher singleton.
 * Must be called once during web server startup.
 *
 * @throws Error if the watcher is already initialized
 */
export function initializePrSyncWatcher(
  featureRepo: IFeatureRepository,
  agentRunRepo: IAgentRunRepository,
  gitPrService: IGitPrService,
  notificationService: INotificationService,
  pollIntervalMs?: number,
  db?: Database.Database | null,
  gitForkService?: IGitForkService | null,
  logger?: ILogger,
  telemetry?: ITelemetry
): void {
  if (watcherInstance !== null) {
    throw new Error('PR sync watcher already initialized. Cannot re-initialize.');
  }

  watcherInstance = new PrSyncWatcherService(
    featureRepo,
    agentRunRepo,
    gitPrService,
    notificationService,
    pollIntervalMs,
    db ?? null,
    gitForkService ?? null,
    logger ?? new ConsoleLogger(),
    telemetry ?? new NoopTelemetry()
  );
}

/**
 * Get the PR sync watcher singleton.
 *
 * @returns The PR sync watcher service
 * @throws Error if the watcher hasn't been initialized yet
 */
export function getPrSyncWatcher(): PrSyncWatcherService {
  if (watcherInstance === null) {
    throw new Error(
      'PR sync watcher not initialized. Call initializePrSyncWatcher() during web server startup.'
    );
  }

  return watcherInstance;
}

/**
 * Check if the PR sync watcher has been initialized.
 */
export function hasPrSyncWatcher(): boolean {
  return watcherInstance !== null;
}

/**
 * Reset the PR sync watcher singleton (for testing purposes only).
 * Stops the watcher if running before resetting.
 *
 * @internal
 */
export function resetPrSyncWatcher(): void {
  if (watcherInstance !== null) {
    watcherInstance.stop();
  }
  watcherInstance = null;
}
