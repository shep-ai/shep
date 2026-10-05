/**
 * Hourly watcher: work the daemon checks once an hour — shipped
 * opportunities and their outcomes (spec 130) and autopilot passes
 * (spec 132). IntervalTask never starts a tick while the previous one runs.
 */

import { IntervalTask } from './interval-task.js';

export const HOURLY_TICK_MS = 60 * 60_000;

export function createHourlyWatcher(
  run: () => Promise<unknown>,
  onError: (error: unknown) => void
): IntervalTask {
  return new IntervalTask(run, HOURLY_TICK_MS, onError);
}
