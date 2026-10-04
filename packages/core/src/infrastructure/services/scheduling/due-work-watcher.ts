/**
 * Due-work watcher: asks every minute for the work whose own interval has
 * passed — tracker sync rules (spec 122) and knowledge sources (spec 125).
 * Each item sets its own interval; the tick only decides how quickly due
 * work is noticed.
 */

import { IntervalTask } from './interval-task.js';

export const DUE_WORK_TICK_MS = 60_000;

export function createDueWorkWatcher(
  runDue: (now: Date) => Promise<unknown>,
  onError: (error: unknown) => void
): IntervalTask {
  return new IntervalTask(() => runDue(new Date()), DUE_WORK_TICK_MS, onError);
}
