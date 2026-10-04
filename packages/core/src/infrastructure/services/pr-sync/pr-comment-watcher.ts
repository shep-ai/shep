/**
 * PR comment watcher (spec 124): every two minutes, reads the comments on
 * pull requests waiting for review and addresses those the space's trigger
 * selects. A round can take many minutes; IntervalTask never starts a tick
 * while the previous one runs.
 */

import { IntervalTask } from '../scheduling/interval-task.js';

export const PR_COMMENT_TICK_MS = 120_000;

export function createPrCommentWatcher(
  runDue: () => Promise<unknown>,
  onError: (error: unknown) => void
): IntervalTask {
  return new IntervalTask(runDue, PR_COMMENT_TICK_MS, onError);
}
