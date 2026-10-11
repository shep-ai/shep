/**
 * Auto-Archive Watcher Service
 *
 * Periodically polls for completed features (Maintain lifecycle) that have
 * exceeded the configured auto-archive delay, and archives them automatically.
 *
 * Follows the same singleton + start/stop pattern as NotificationWatcherService.
 *
 * The poll interval is 60 seconds — auto-archiving is not time-critical and
 * a minute-level granularity keeps DB load minimal.
 */

import type { IFeatureRepository } from '../../../application/ports/output/repositories/feature-repository.interface.js';
import { AutoArchiveCompletedUseCase } from '../../../application/use-cases/features/auto-archive-completed.use-case.js';
import { ArchiveFeatureUseCase } from '../../../application/use-cases/features/archive-feature.use-case.js';
import { DeleteFeatureCheckpointsUseCase } from '../../../application/use-cases/features/checkpoints/delete-feature-checkpoints.use-case.js';
import { container } from 'tsyringe';
import { getSettings } from '../settings.service.js';

const DEFAULT_POLL_INTERVAL_MS = 60_000;
const DEFAULT_DELAY_MINUTES = 10;

export class AutoArchiveWatcherService {
  private readonly featureRepo: IFeatureRepository;
  private readonly pollIntervalMs: number;
  private intervalId: ReturnType<typeof setInterval> | null = null;

  /**
   * @param deleteCheckpoints - archiving deletes the feature's git checkpoints
   *   (spec 138); resolved from the container at poll time when not given.
   */
  constructor(
    featureRepo: IFeatureRepository,
    pollIntervalMs: number = DEFAULT_POLL_INTERVAL_MS,
    private readonly deleteCheckpoints?: DeleteFeatureCheckpointsUseCase
  ) {
    this.featureRepo = featureRepo;
    this.pollIntervalMs = pollIntervalMs;
  }

  isRunning(): boolean {
    return this.intervalId !== null;
  }

  start(): void {
    if (this.intervalId !== null) return;

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
    }
  }

  private async poll(): Promise<void> {
    try {
      const settings = getSettings();
      const delayMinutes = settings.workflow.autoArchiveDelayMinutes ?? DEFAULT_DELAY_MINUTES;

      if (delayMinutes <= 0) return;

      const archiveFeature = new ArchiveFeatureUseCase(
        this.featureRepo,
        this.deleteCheckpoints ?? container.resolve(DeleteFeatureCheckpointsUseCase)
      );
      const useCase = new AutoArchiveCompletedUseCase(this.featureRepo, archiveFeature);
      await useCase.execute(delayMinutes);
    } catch {
      // Settings not initialized or DB not ready — skip this poll cycle
    }
  }
}

// --- Singleton accessors (follows NotificationWatcher pattern) ---

let watcherInstance: AutoArchiveWatcherService | null = null;

/**
 * Initialize the auto-archive watcher singleton.
 * Must be called once during web server startup.
 *
 * @throws Error if the watcher is already initialized
 */
export function initializeAutoArchiveWatcher(
  featureRepo: IFeatureRepository,
  pollIntervalMs?: number
): void {
  if (watcherInstance !== null) {
    throw new Error('Auto-archive watcher already initialized. Cannot re-initialize.');
  }

  watcherInstance = new AutoArchiveWatcherService(featureRepo, pollIntervalMs);
}

/**
 * Get the auto-archive watcher singleton.
 *
 * @returns The auto-archive watcher service
 * @throws Error if the watcher hasn't been initialized yet
 */
export function getAutoArchiveWatcher(): AutoArchiveWatcherService {
  if (watcherInstance === null) {
    throw new Error(
      'Auto-archive watcher not initialized. Call initializeAutoArchiveWatcher() during web server startup.'
    );
  }

  return watcherInstance;
}

/**
 * Check if the auto-archive watcher has been initialized.
 */
export function hasAutoArchiveWatcher(): boolean {
  return watcherInstance !== null;
}

/**
 * Reset the auto-archive watcher singleton (for testing purposes only).
 * Stops the watcher if running before resetting.
 *
 * @internal
 */
export function resetAutoArchiveWatcher(): void {
  if (watcherInstance !== null) {
    watcherInstance.stop();
  }
  watcherInstance = null;
}
