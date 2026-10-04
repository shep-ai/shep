/**
 * IntervalTask
 *
 * Runs an async job every interval inside a long-lived process (the daemon,
 * `shep ui`), without ever stacking a run behind a slow previous one and
 * without holding the process open. Errors go to `onError`; the schedule
 * carries on.
 */

export class IntervalTask {
  private timer: ReturnType<typeof setInterval> | null = null;
  private inFlight = false;

  constructor(
    private readonly job: () => Promise<unknown>,
    private readonly intervalMs: number,
    private readonly onError: (error: unknown) => void = () => undefined
  ) {}

  isRunning(): boolean {
    return this.timer !== null;
  }

  /** Schedule ticks. The first one fires after one interval, not now. */
  start(): void {
    if (this.timer !== null) return;
    this.timer = setInterval(() => void this.tick(), this.intervalMs);
    // Never hold the process open just for a background job.
    this.timer.unref?.();
  }

  stop(): void {
    if (this.timer === null) return;
    clearInterval(this.timer);
    this.timer = null;
  }

  private async tick(): Promise<void> {
    // A slow run must not stack up behind itself.
    if (this.inFlight) return;
    this.inFlight = true;
    try {
      await this.job();
    } catch (error) {
      this.onError(error);
    } finally {
      this.inFlight = false;
    }
  }
}
