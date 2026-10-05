/**
 * Outcome watcher (spec 130): every hour, ships Building opportunities whose
 * work item is done and judges outcomes whose window has passed.
 */

import { IntervalTask } from './interval-task.js';

export const OUTCOME_TICK_MS = 60 * 60_000;

export function createOutcomeWatcher(
  run: () => Promise<unknown>,
  onError: (error: unknown) => void
): IntervalTask {
  return new IntervalTask(run, OUTCOME_TICK_MS, onError);
}
