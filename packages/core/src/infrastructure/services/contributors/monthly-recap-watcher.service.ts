/**
 * Monthly Contributor Recap Watcher Service
 *
 * Time-driven companion to the contributor pipeline (spec 097, FR-31 /
 * FR-32). Once per poll interval (default daily), checks whether the
 * previous calendar month's recap has already been generated; if not,
 * generates it via `GenerateMonthlyRecapUseCase` and fans the artifact
 * out across the configured publish targets via
 * `PublishMonthlyRecapUseCase`. Each channel publish is gated through
 * `IContributorActionGate` inside the use case; the watcher trusts the
 * gate to decide what actually goes out.
 */

import { RecapChannel } from '../../../domain/generated/output.js';
import type { GenerateMonthlyRecapUseCase } from '../../../application/use-cases/contributors/generate-monthly-recap.use-case.js';
import type {
  PublishMonthlyRecapUseCase,
  PublishMonthlyRecapResult,
} from '../../../application/use-cases/contributors/publish-monthly-recap.use-case.js';
import type { RecapTarget } from '../../../application/ports/output/services/recap-publisher.interface.js';

export const DEFAULT_RECAP_POLL_INTERVAL_MS = 24 * 60 * 60 * 1000;
const DEFAULT_TARGETS: readonly RecapTarget[] = [{ channel: RecapChannel.File }];

export interface MonthlyRecapWatcherDeps {
  generate: GenerateMonthlyRecapUseCase;
  publish: PublishMonthlyRecapUseCase;
  /** Optional override of "now" — useful for deterministic tests. */
  now?: () => Date;
  /** Optional overrideable storage of which months have already shipped. */
  recapAlreadyPublished?: (yearMonth: string) => Promise<boolean>;
  /** Optional override of publish targets; defaults to file-only. */
  targets?: readonly RecapTarget[];
  /** Optional poll interval (ms). */
  pollIntervalMs?: number;
}

export class MonthlyRecapWatcherService {
  private readonly deps: Required<
    Pick<MonthlyRecapWatcherDeps, 'generate' | 'publish' | 'now' | 'targets' | 'pollIntervalMs'>
  > & { recapAlreadyPublished: (ym: string) => Promise<boolean> };
  private readonly publishedThisProcess = new Set<string>();
  private intervalId: ReturnType<typeof setInterval> | null = null;

  constructor(deps: MonthlyRecapWatcherDeps) {
    this.deps = {
      generate: deps.generate,
      publish: deps.publish,
      now: deps.now ?? (() => new Date()),
      targets: deps.targets ?? DEFAULT_TARGETS,
      pollIntervalMs: deps.pollIntervalMs ?? DEFAULT_RECAP_POLL_INTERVAL_MS,
      recapAlreadyPublished: deps.recapAlreadyPublished ?? (async () => false),
    };
  }

  isRunning(): boolean {
    return this.intervalId !== null;
  }

  start(): void {
    if (this.intervalId !== null) return;
    void this.poll();
    this.intervalId = setInterval(() => {
      void this.poll();
    }, this.deps.pollIntervalMs);
  }

  stop(): void {
    if (this.intervalId !== null) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  /** Exposed for tests: returns the publish result if a recap shipped. */
  async poll(): Promise<PublishMonthlyRecapResult | null> {
    const yearMonth = previousYearMonth(this.deps.now());
    if (this.publishedThisProcess.has(yearMonth)) return null;
    try {
      if (await this.deps.recapAlreadyPublished(yearMonth)) {
        this.publishedThisProcess.add(yearMonth);
        return null;
      }
      const { artifact } = await this.deps.generate.execute({ yearMonth });
      const result = await this.deps.publish.execute({
        artifact,
        targets: this.deps.targets,
      });
      this.publishedThisProcess.add(yearMonth);
      return result;
    } catch {
      return null;
    }
  }
}

/**
 * Compute the UTC `YYYY-MM` of the calendar month immediately before
 * the given `now`. The recap is always for the *previous* month so we
 * are not running mid-month on partial data.
 */
export function previousYearMonth(now: Date): string {
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();
  const prev = new Date(Date.UTC(year, month - 1, 1));
  const yyyy = prev.getUTCFullYear();
  const mm = String(prev.getUTCMonth() + 1).padStart(2, '0');
  return `${yyyy}-${mm}`;
}

let watcherInstance: MonthlyRecapWatcherService | null = null;

export function initializeMonthlyRecapWatcher(deps: MonthlyRecapWatcherDeps): void {
  if (watcherInstance !== null) {
    throw new Error('Monthly recap watcher already initialized. Cannot re-initialize.');
  }
  watcherInstance = new MonthlyRecapWatcherService(deps);
}

export function getMonthlyRecapWatcher(): MonthlyRecapWatcherService {
  if (watcherInstance === null) {
    throw new Error(
      'Monthly recap watcher not initialized. Call initializeMonthlyRecapWatcher() during web server startup.'
    );
  }
  return watcherInstance;
}

export function hasMonthlyRecapWatcher(): boolean {
  return watcherInstance !== null;
}

export function resetMonthlyRecapWatcher(): void {
  if (watcherInstance !== null) {
    watcherInstance.stop();
  }
  watcherInstance = null;
}
