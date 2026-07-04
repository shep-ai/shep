/**
 * Small process-lifetime helpers used by the graceful stop flow
 * (SIGTERM → poll → SIGKILL).
 */

import type { ChildProcess } from 'node:child_process';

/**
 * Poll until the given pid is no longer alive.
 * Resolves true when the process died within maxMs, false on timeout.
 */
export async function pollUntilDead(
  isAlive: (pid: number) => boolean,
  pid: number,
  maxMs: number,
  intervalMs: number
): Promise<boolean> {
  const deadline = Date.now() + maxMs;
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
    if (!isAlive(pid)) {
      return true;
    }
  }
  return false;
}

/**
 * Wait for a child's 'exit' event, bounded by a timeout so a missing event
 * (already-exited process) can't hang the caller.
 */
export function waitForExit(child: ChildProcess, timeoutMs: number): Promise<void> {
  return new Promise((resolve) => {
    const timeout = setTimeout(() => resolve(), timeoutMs);
    child.on('exit', () => {
      clearTimeout(timeout);
      resolve();
    });
  });
}
