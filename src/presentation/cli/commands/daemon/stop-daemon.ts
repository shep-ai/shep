/**
 * stopDaemon() — Shared daemon-stop helper
 *
 * Contains the stop logic for terminating a running Shep daemon.
 * Used by:
 *   - stop.command.ts (shep stop)
 *   - restart.command.ts (shep restart)
 *   - upgrade.command.ts (shep upgrade — stops before install)
 *
 * Unix stop sequence (real graceful shutdown semantics):
 *   1. Send SIGTERM to the process tree
 *   2. Poll liveness every 200ms for up to 5000ms — the daemon may need
 *      time to flush state, close DB connections, etc.
 *   3. If still alive after 5s, escalate to SIGKILL
 *
 * Windows stop sequence (no graceful shutdown exists):
 *   1. Run `taskkill /T /F` synchronously (always forceful — Windows has
 *      no SIGTERM equivalent, and `tree-kill` always passes /F regardless
 *      of which signal the caller specified)
 *   2. Single liveness check; no polling loop, since the kill is already
 *      forceful and synchronous
 *
 * In all paths, daemon.json is deleted in a `finally` block (NFR-2).
 *
 * @param daemonService - IDaemonService instance (injected by caller for testability, NFR-4)
 */

import { treeKill } from '@/infrastructure/services/process/tree-kill.js';
import type { IDaemonService } from '@/application/ports/output/services/daemon-service.interface.js';
import { messages } from '../../ui/index.js';
import { getCliI18n } from '../../i18n.js';

const POLL_INTERVAL_MS = 200;
const MAX_WAIT_MS = 5000;
const isWindows = process.platform === 'win32';

/**
 * Poll until the given PID is dead or the timeout expires.
 * Returns true if the process is dead, false if it survived the timeout.
 *
 * Checks before sleeping — a process that exits immediately should not pay
 * a full poll-interval tax before being noticed.
 */
async function pollUntilDead(
  daemonService: IDaemonService,
  pid: number,
  maxMs: number,
  intervalMs: number
): Promise<boolean> {
  const deadline = Date.now() + maxMs;
  while (true) {
    if (!daemonService.isAlive(pid)) return true;
    if (Date.now() >= deadline) return false;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}

/**
 * Promise wrapper around `tree-kill`'s callback API. Resolves once the kill
 * subprocess (`taskkill` on Windows, `kill`/`pgrep` on Unix) has finished.
 * Errors are swallowed — the caller verifies death via `isAlive` afterwards.
 */
function awaitTreeKill(pid: number, signal: 'SIGTERM' | 'SIGKILL'): Promise<void> {
  return new Promise((resolve) => {
    try {
      treeKill(pid, signal, () => resolve());
    } catch {
      resolve();
    }
  });
}

/**
 * Stop the Shep daemon.
 * Safe to call when no daemon is running — silently cleans up stale daemon.json (NFR-2).
 */
export async function stopDaemon(daemonService: IDaemonService): Promise<void> {
  const state = await daemonService.read();

  // No daemon running or PID not alive — silently clean up and return
  if (!state || !daemonService.isAlive(state.pid)) {
    await daemonService.delete();
    return;
  }

  const { pid } = state;

  // Validate PID is a positive finite integer before kill
  if (!Number.isFinite(pid) || !Number.isInteger(pid) || pid <= 0) {
    await daemonService.delete();
    return;
  }

  try {
    const t = getCliI18n().t;
    messages.info(t('cli:ui.daemon.stoppingDaemon', { pid }));

    if (isWindows) {
      // Windows: tree-kill resolves to `taskkill /T /F` regardless of the
      // signal name, so SIGTERM and SIGKILL are identical here. Wait for
      // taskkill to actually return before checking liveness — no polling
      // loop, no escalation step.
      await awaitTreeKill(pid, 'SIGTERM');
    } else {
      // Unix: SIGTERM gives the daemon a chance to shut down gracefully.
      // Poll for up to 5s, then escalate to SIGKILL if needed.
      treeKill(pid, 'SIGTERM');
      const died = await pollUntilDead(daemonService, pid, MAX_WAIT_MS, POLL_INTERVAL_MS);
      if (!died) {
        messages.info(t('cli:ui.daemon.sigkillFallback'));
        try {
          treeKill(pid, 'SIGKILL');
        } catch {
          // Process may have exited between the check and the kill — ignore
        }
      }
    }

    messages.success(t('cli:ui.daemon.daemonStopped'));
  } finally {
    // Always clean up daemon.json regardless of termination path
    await daemonService.delete();
  }
}
