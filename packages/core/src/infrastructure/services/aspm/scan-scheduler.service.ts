/**
 * Nightly auto-rescan scheduler (Phase 11, task-81).
 *
 * Daemon-side loop that re-scans every Application whose ScannerProfile
 * opts in to autoRescan and whose lastScannedAt is older than the
 * configured TTL (default 24h). The loop is a thin guard around a
 * RescanApplicationUseCase invocation per stale app.
 *
 * Injectable via constructor for tests: clock + interval are deps so
 * we can drive the scheduler with vi.useFakeTimers().
 */

import { inject, injectable } from 'tsyringe';
import type { IApplicationRepository } from '../../../application/ports/output/repositories/application-repository.interface.js';
import { RescanApplicationUseCase } from '../../../application/use-cases/aspm/scan/rescan-application.js';
import { ScanTrigger } from '../../../domain/generated/output.js';

export interface ScanSchedulerDeps {
  /** Returns current time. Override for tests. */
  now?: () => Date;
  /** Re-check interval in ms. Default 15 minutes. */
  checkIntervalMs?: number;
  /** Rescan TTL in ms. Default 24h. */
  staleAfterMs?: number;
  /** When true, the scheduler is a no-op (e.g. global "auto-rescan disabled" setting). */
  enabled?: () => boolean;
}

const DEFAULT_CHECK_INTERVAL_MS = 15 * 60 * 1000;
const DEFAULT_STALE_AFTER_MS = 24 * 60 * 60 * 1000;

@injectable()
export class ScanSchedulerService {
  private timer: ReturnType<typeof setInterval> | null = null;
  private now: () => Date = () => new Date();
  private checkIntervalMs: number = DEFAULT_CHECK_INTERVAL_MS;
  private staleAfterMs: number = DEFAULT_STALE_AFTER_MS;
  private enabled: () => boolean = () => true;
  private inFlight = new Set<string>();

  constructor(
    @inject('IApplicationRepository') private readonly appRepo: IApplicationRepository,
    @inject(RescanApplicationUseCase) private readonly rescan: RescanApplicationUseCase
  ) {}

  configure(deps: ScanSchedulerDeps): void {
    if (deps.now) this.now = deps.now;
    if (typeof deps.checkIntervalMs === 'number') this.checkIntervalMs = deps.checkIntervalMs;
    if (typeof deps.staleAfterMs === 'number') this.staleAfterMs = deps.staleAfterMs;
    if (deps.enabled) this.enabled = deps.enabled;
  }

  start(): void {
    if (this.timer !== null) return;
    void this.tick();
    this.timer = setInterval(() => {
      void this.tick();
    }, this.checkIntervalMs);
  }

  stop(): void {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  async tick(): Promise<void> {
    if (!this.enabled()) return;
    const apps = await this.appRepo.list();
    const threshold = this.now().getTime() - this.staleAfterMs;

    for (const app of apps) {
      if (app.scannerProfile?.autoRescan === false) continue;
      const lastScanned = app.lastScannedAt
        ? app.lastScannedAt instanceof Date
          ? app.lastScannedAt.getTime()
          : Date.parse(String(app.lastScannedAt))
        : 0;
      if (lastScanned > threshold) continue;
      if (this.inFlight.has(app.id)) continue;

      this.inFlight.add(app.id);
      try {
        await this.rescan.execute({ applicationId: app.id, triggeredBy: ScanTrigger.Schedule });
      } catch {
        // swallow — surface via ScanRun.status, not via daemon crash.
      } finally {
        this.inFlight.delete(app.id);
      }
    }
  }
}
