/**
 * Feature Agent-Run Liveness Rules
 *
 * The named thresholds the run-liveness sweep uses to decide that a feature
 * run's worker is gone or hung, mirroring `cluster-liveness.ts`. Every
 * threshold is a multiple of the worker's heartbeat interval so the rules move
 * together if the interval ever changes.
 *
 * Note the import convention: relative imports inside `domain/` carry no file
 * extension (the web package consumes this directory as raw TypeScript).
 */

/** How often a feature worker refreshes `last_heartbeat` (and `updated_at`). */
export const FEATURE_WORKER_HEARTBEAT_INTERVAL_MS = 30_000;

/**
 * Silence after which a LIVE worker is treated as hung: ten missed heartbeats.
 *
 * The heartbeat runs on its own timer, independent of what the graph is doing,
 * so it only stops when the worker's event loop is wedged (or the process is
 * frozen). Ten intervals ride out the benign gaps — a heartbeat write that lost
 * to SQLITE_BUSY is simply retried on the next tick, and a long synchronous
 * step can delay a few ticks — while still catching a wedged worker within
 * minutes rather than never.
 */
export const STALE_HEARTBEAT_THRESHOLD_MS = 10 * FEATURE_WORKER_HEARTBEAT_INTERVAL_MS;

/**
 * How long a `running` run whose recorded pid is dead is left alone: four
 * heartbeat intervals.
 *
 * A run is handed from one worker to the next without its pid changing first:
 * Approve/Reject claim the row as `running` and only the new worker's boot
 * claim writes its own pid. Inside that window the pid on the row is the old,
 * exited worker's. A live worker refreshes `updated_at` every interval, so a
 * row untouched for four of them really has no worker.
 */
export const DEAD_WORKER_GRACE_MS = 4 * FEATURE_WORKER_HEARTBEAT_INTERVAL_MS;

/**
 * How long a run that should have a worker may go without one recording its
 * pid before it is reported as never started: thirty minutes.
 *
 * Deliberately generous. Before a worker exists, the spawner may still be
 * generating the feature's metadata with an AI call and creating its worktree,
 * whose setup hooks run with a (configurable) 5-minute timeout each. Waiting
 * too long only delays reporting a run that is already dead; not waiting long
 * enough fails a feature that was about to start.
 */
export const WORKER_BOOT_GRACE_MS = 60 * FEATURE_WORKER_HEARTBEAT_INTERVAL_MS;

const MS_PER_MINUTE = 60_000;

/** Milliseconds between `instant` and `now`; an absent or unparseable instant is infinitely old. */
export function millisecondsSince(instant: Date | string | number | undefined, now: Date): number {
  if (instant === undefined || instant === null) return Number.POSITIVE_INFINITY;
  const ms = instant instanceof Date ? instant.getTime() : new Date(instant).getTime();
  return Number.isNaN(ms) ? Number.POSITIVE_INFINITY : now.getTime() - ms;
}

/** Did more than `thresholdMs` pass between `instant` and `now`? */
export function isOlderThan(
  instant: Date | string | number | undefined,
  thresholdMs: number,
  now: Date
): boolean {
  return millisecondsSince(instant, now) > thresholdMs;
}

/** Whole minutes in a threshold, for messages a user reads. */
export function thresholdMinutes(thresholdMs: number): number {
  return Math.round(thresholdMs / MS_PER_MINUTE);
}

/** Error recorded on a run whose worker process is gone. */
export function crashedWorkerMessage(pid: number): string {
  return `Agent process (PID ${pid}) crashed or was killed`;
}
