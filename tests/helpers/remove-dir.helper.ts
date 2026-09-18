/**
 * Retrying recursive directory removal for tests.
 *
 * Why this exists: on Windows a just-terminated child process keeps a handle
 * on its working directory — and on every file it had open — for a short,
 * unbounded window *after* it has exited. A bare `rmSync` in a `finally`
 * block therefore fails with `EBUSY` / `EPERM` / `ENOTEMPTY` and turns a
 * passing assertion into a red CI job.
 *
 * Node's own `maxRetries` / `retryDelay` are built for exactly this race.
 * Six suites had already discovered that independently and inlined their own
 * budgets; this helper is the single place that owns them.
 *
 * Prefer waiting for the child to actually exit where the API allows it —
 * this is the safety net for the handles the OS releases on its own schedule,
 * not a substitute for deterministic teardown.
 */

import { rmSync } from 'node:fs';

const IS_WINDOWS = process.platform === 'win32';

/**
 * Retry budget. Windows holds locks well past process exit; POSIX releases
 * them with the last file descriptor, so a small budget there is ample.
 */
const RM_MAX_RETRIES = IS_WINDOWS ? 12 : 5;

/** Delay between retries — worst-case wait is {@link RM_MAX_RETRIES} x this. */
const RM_RETRY_DELAY_MS = 250;

/**
 * Remove a directory tree, retrying while the OS still holds handles on it.
 *
 * Never throws for a missing path (`force: true`), so it is safe to call from
 * a `finally` block that may run before the directory was ever created.
 *
 * @param dir - Absolute path to the directory to remove.
 */
export function removeDirWithRetry(dir: string): void {
  rmSync(dir, {
    recursive: true,
    force: true,
    maxRetries: RM_MAX_RETRIES,
    retryDelay: RM_RETRY_DELAY_MS,
  });
}
