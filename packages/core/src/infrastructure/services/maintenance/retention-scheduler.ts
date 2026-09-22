/**
 * Retention Scheduler
 *
 * Re-runs data retention inside a long-lived process (the daemon and
 * `shep ui`). Retention otherwise runs only at process start, so a daemon
 * that stayed up for weeks never pruned the history — agent and interactive
 * messages, the operation log, worker log files — it kept writing (spec 116).
 *
 * Each tick is cheap: `PruneRetainedDataUseCase` claims a once-a-day cycle
 * first, so a tick that is not due costs one indexed point read.
 */

/**
 * How often the process asks whether a prune is due. Far shorter than the
 * daily prune interval, so a daemon started just after another process
 * pruned still prunes within an hour of the next cycle opening.
 */
export const RETENTION_CHECK_INTERVAL_MS = 60 * 60 * 1000;

export class RetentionScheduler {
  private timer: ReturnType<typeof setInterval> | null = null;
  private inFlight = false;

  constructor(
    private readonly prune: () => Promise<unknown>,
    private readonly onError: (error: unknown) => void = () => undefined,
    private readonly intervalMs: number = RETENTION_CHECK_INTERVAL_MS
  ) {}

  isRunning(): boolean {
    return this.timer !== null;
  }

  /** Schedule ticks. The first one fires after one interval, not now. */
  start(): void {
    if (this.timer !== null) return;
    this.timer = setInterval(() => void this.tick(), this.intervalMs);
    // Never hold the process open just to prune history.
    this.timer.unref?.();
  }

  stop(): void {
    if (this.timer === null) return;
    clearInterval(this.timer);
    this.timer = null;
  }

  private async tick(): Promise<void> {
    // A slow prune (a year of backlog) must not stack up behind itself.
    if (this.inFlight) return;
    this.inFlight = true;
    try {
      await this.prune();
    } catch (error) {
      this.onError(error);
    } finally {
      this.inFlight = false;
    }
  }
}
