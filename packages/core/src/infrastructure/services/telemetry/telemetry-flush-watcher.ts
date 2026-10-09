/**
 * Telemetry flush watcher (spec 133).
 *
 * Every minute in a long-lived server process (the daemon, or `shep ui`):
 * record the daily install heartbeat if one is due, then send due outbox
 * events. A failed heartbeat must not hold back the flush.
 */

import { IntervalTask } from '../scheduling/interval-task.js';

export const TELEMETRY_FLUSH_TICK_MS = 60_000;

export interface TelemetryFlushJobs {
  heartbeat: () => Promise<unknown>;
  flush: () => Promise<unknown>;
}

export function createTelemetryFlushWatcher(
  jobs: TelemetryFlushJobs,
  onError: (error: unknown) => void
): IntervalTask {
  return new IntervalTask(
    async () => {
      try {
        await jobs.heartbeat();
      } catch (error) {
        onError(error);
      }
      await jobs.flush();
    },
    TELEMETRY_FLUSH_TICK_MS,
    onError
  );
}
