/**
 * Tracker sync watcher (spec 122): asks every minute for the sync rules whose
 * interval has passed. Rules set their own interval; the tick only decides
 * how quickly a due rule is noticed.
 */

import { IntervalTask } from '../scheduling/interval-task.js';

export const TRACKER_SYNC_TICK_MS = 60_000;

export function createTrackerSyncWatcher(
  runDue: (now: Date) => Promise<unknown>,
  onError: (error: unknown) => void
): IntervalTask {
  return new IntervalTask(() => runDue(new Date()), TRACKER_SYNC_TICK_MS, onError);
}
