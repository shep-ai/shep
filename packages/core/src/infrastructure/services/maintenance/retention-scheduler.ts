import { IntervalTask } from '../scheduling/interval-task.js';

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

/** Re-runs data retention every {@link RETENTION_CHECK_INTERVAL_MS}. */
export class RetentionScheduler extends IntervalTask {
  constructor(
    prune: () => Promise<unknown>,
    onError: (error: unknown) => void = () => undefined,
    intervalMs: number = RETENTION_CHECK_INTERVAL_MS
  ) {
    super(prune, intervalMs, onError);
  }
}
