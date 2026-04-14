/**
 * Boot Watchdog
 *
 * Boot-phase watchdog: how long the agent is allowed to go WITHOUT
 * emitting any stream event (delta / tool_use / tool_result / status)
 * before we consider the boot stuck and abort it.
 *
 * This is an IDLE timer, not a wall-clock budget: each event received
 * resets it. That's essential for application-creation flows where the
 * first turn legitimately takes many minutes (scaffold + install + build
 * a whole project). A fixed wall-clock budget would kill those mid-way.
 *
 * ## Contract
 *
 * - `start(onStall)` arms the timer. The supplied callback fires exactly
 *   once if the timer elapses without a `bump()` in the meantime.
 * - `bump()` resets the remaining time back to `IDLE_TIMEOUT_MS`. Called
 *   on every stream event the consumer observes during boot.
 * - `stop()` cancels the pending timer. Always called from a `finally`
 *   block so a crash in the consume loop never leaks a timer.
 *
 * The stall handler is latched: once it fires (or `stop()` clears the
 * timer) a subsequent `bump()` is a no-op until the next `start()`.
 */

export class BootWatchdog {
  /**
   * Maximum idle duration in milliseconds. Part of the public contract:
   * unit tests and callers that format user-facing stall errors depend
   * on this constant being readable from the outside.
   */
  static readonly IDLE_TIMEOUT_MS = 120_000;

  private timer: NodeJS.Timeout | null = null;
  private onStall: (() => void) | null = null;

  /**
   * Arm the timer. The supplied handler fires after `IDLE_TIMEOUT_MS`
   * unless `bump()` or `stop()` intervenes.
   */
  start(onStall: () => void): void {
    this.onStall = onStall;
    this.schedule();
  }

  /**
   * Reset the remaining time back to `IDLE_TIMEOUT_MS`. No-op when the
   * watchdog is not currently armed (see file header: stall handler is
   * latched, so post-stop bumps must not re-arm).
   */
  bump(): void {
    if (!this.onStall) return;
    this.schedule();
  }

  /**
   * Cancel the pending timer and clear the stall handler. Idempotent —
   * safe to call from a `finally` block even if `start()` was never
   * invoked or `stop()` already ran.
   */
  stop(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.onStall = null;
  }

  private schedule(): void {
    if (this.timer) {
      clearTimeout(this.timer);
    }
    this.timer = setTimeout(() => {
      const handler = this.onStall;
      // Latch: clear state BEFORE firing so a re-entrant bump() during
      // the handler (or accidental second scheduling) can't double-fire.
      this.timer = null;
      this.onStall = null;
      handler?.();
    }, BootWatchdog.IDLE_TIMEOUT_MS);
  }
}
