/**
 * startDaemon() — Shared daemon-spawn helper
 *
 * Contains the parent-side logic for starting the Shep web UI as a
 * detached background daemon. Used by both:
 *   - The default `shep` action (index.ts)
 *   - The `shep start` command (start.command.ts)
 *
 * Flow:
 *   1. Acquire the cross-process start lock (a concurrent `shep start` waits)
 *   2. Check if daemon is already running (idempotent — print URL and return)
 *   3. Resolve available port (respects --port override); rotate daemon.log
 *   4. Spawn the daemon with execArgv propagated (supports tsx in dev mode)
 *      {detached: true, stdio: ['ignore','ignore','pipe']} + child.unref()
 *   5. Wait briefly to confirm the child is alive (exit event AND pid check)
 *   6. Wait for readiness (HTTP answers), bounded; a child that exits first
 *      is reported as failed and never recorded
 *   7. Write daemon.json atomically via IDaemonService, then release the lock
 *   8. Open browser via IBrowserOpener (resolved from DI container)
 *
 * Steps 2–7 run under the lock: two unserialised starts both saw "no live
 * daemon", both chose the same free port, and the loser (dying on
 * EADDRINUSE) overwrote daemon.json and rotated the winner's log.
 */

import { spawn } from 'node:child_process';
import { closeSync, openSync, renameSync, existsSync } from 'node:fs';
import { container } from '@/infrastructure/di/container.js';
import { findAvailablePort, DEFAULT_PORT } from '@/infrastructure/services/port.service.js';
import { getDaemonLogPath } from '@/infrastructure/services/filesystem/shep-directory.service.js';
import {
  acquireDaemonStartLock,
  getDaemonStartLockPath,
} from '@/infrastructure/services/daemon/daemon-start-lock.js';
import { ROTATED_LOG_SUFFIX } from '@/infrastructure/services/logging/daemon-log-rotator.js';
import { fmt, messages, spinner } from '../../ui/index.js';
import type { IDaemonService } from '@/application/ports/output/services/daemon-service.interface.js';
import type { IBrowserOpener } from '@/application/ports/output/services/i-browser-opener.js';
import { getCliI18n } from '../../i18n.js';
import { DaemonReadiness, waitForDaemonReady } from './daemon-readiness.js';

/** How long to wait (ms) after spawn to verify the child is still alive. */
export const SPAWN_SETTLE_MS = 500;

export interface StartDaemonOptions {
  port?: number;
}

/**
 * Start the Shep web UI as a detached background daemon.
 * Idempotent: if a daemon is already running, prints the existing URL and returns.
 */
export async function startDaemon(opts: StartDaemonOptions = {}): Promise<void> {
  const daemonService = container.resolve<IDaemonService>('IDaemonService');

  const lock = await acquireDaemonStartLock(getDaemonStartLockPath(), {
    isAlive: (pid) => daemonService.isAlive(pid),
  });
  let url: string | null;
  try {
    url = await spawnDaemonUnderLock(daemonService, opts);
  } finally {
    lock.release();
  }
  if (!url) return;

  announceDaemon(url);
}

/**
 * Everything that must not interleave with another `shep start`. Returns the
 * URL of a daemon this call spawned and recorded, or null when nothing more
 * is to be done (already running, or the child died).
 */
async function spawnDaemonUnderLock(
  daemonService: IDaemonService,
  opts: StartDaemonOptions
): Promise<string | null> {
  const t = getCliI18n().t;

  // Check for an already-running daemon — inside the lock, so a start that
  // finished while we waited is seen here.
  const existing = await daemonService.read();
  if (existing && daemonService.isAlive(existing.pid)) {
    const url = `http://localhost:${existing.port}`;
    messages.newline();
    messages.info(t('cli:ui.daemon.alreadyRunning', { url: fmt.code(url) }));
    messages.newline();
    return null;
  }

  // Resolve the port
  const startPort = opts.port ?? DEFAULT_PORT;
  const port = await findAvailablePort(startPort);

  // Rotate existing daemon.log → daemon.log.old (keep 1 backup). Safe here:
  // no live daemon is recorded and the lock keeps another start from
  // spawning one between that check and this rename.
  //
  // This start-of-day rotation is only half the policy: the running daemon
  // also caps the log on SIZE via DaemonLogRotator (see _serve.command.ts),
  // because a daemon that stays up for weeks would otherwise write one
  // unbounded file between restarts. The suffix is shared so both halves
  // keep exactly one generation.
  const logPath = getDaemonLogPath();
  try {
    if (existsSync(logPath)) {
      renameSync(logPath, `${logPath}${ROTATED_LOG_SUFFIX}`);
    }
  } catch {
    // Best-effort rotation — continue even if rename fails
  }

  // Open log file for daemon stdout+stderr redirection
  const logFd = openSync(logPath, 'a', 0o600);

  // Spawn the daemon as a detached child process.
  // Propagate process.execArgv so tsx loader hooks (--require / --import) are
  // available in dev mode. In production (compiled JS), execArgv is empty.
  // stdout and stderr are both redirected to daemon.log.
  const child = spawn(
    process.execPath,
    [...process.execArgv, process.argv[1], '_serve', '--port', String(port)],
    {
      detached: true,
      stdio: ['ignore', logFd, logFd],
      windowsHide: true,
    }
  );

  // Wait briefly for the child to either settle or crash.
  const childExited = new Promise<number | null>((resolve) =>
    child.on('exit', (code) => resolve(code))
  );
  let settleTimer: ReturnType<typeof setTimeout> | undefined;
  const exitCode = await Promise.race([
    childExited,
    new Promise<undefined>((resolve) => {
      settleTimer = setTimeout(() => resolve(undefined), SPAWN_SETTLE_MS);
    }),
  ]);
  clearTimeout(settleTimer);
  closeSync(logFd);

  const reportFailure = async (code: number | null | undefined): Promise<null> => {
    messages.newline();
    messages.error(t('cli:ui.daemon.daemonFailed', { code: code ?? 'unknown' }));
    messages.info(t('cli:ui.daemon.checkLogs', { path: fmt.code(logPath) }));
    messages.newline();
    // Clean up stale daemon.json if it exists
    await daemonService.delete();
    return null;
  };

  // An exit event is not the only way to die in the window (the event can
  // be lost once we unref), so also confirm the pid before recording it.
  const isChildAlive = () => !!child.pid && daemonService.isAlive(child.pid);
  if (exitCode !== undefined || !isChildAlive()) return reportFailure(exitCode);

  const url = `http://localhost:${port}`;
  messages.newline();
  console.log(fmt.heading(t('cli:ui.daemon.heading')));
  messages.newline();

  // Record the daemon only once it serves (or is still alive at the
  // timeout): a child that dies while booting must not leave a dead pid in
  // daemon.json. Skipped in E2E / CI where the child cannot start Next.js
  // within the test's time window.
  if (process.env.SHEP_SKIP_READINESS_CHECK) {
    messages.success(t('cli:ui.daemon.daemonSpawned', { url: fmt.code(url) }));
  } else {
    const readiness = await spinner(t('cli:ui.daemon.startingServer'), () =>
      waitForDaemonReady(url, childExited)
    );
    if (readiness === DaemonReadiness.Exited || !isChildAlive()) {
      return reportFailure(await Promise.race([childExited, Promise.resolve(undefined)]));
    }
    if (readiness === DaemonReadiness.Ready) {
      messages.success(t('cli:ui.daemon.serverReady', { url: fmt.code(url) }));
    } else {
      messages.warning(t('cli:ui.daemon.serverMayBeStarting', { url: fmt.code(url) }));
    }
  }
  messages.newline();

  // Child is alive — detach fully.
  child.unref();

  // Write daemon.json atomically
  await daemonService.write({
    pid: child.pid!,
    port,
    startedAt: new Date().toISOString(),
  });

  return url;
}

/** Open the browser on a daemon this call started and recorded. */
function announceDaemon(url: string): void {
  const opener = container.resolve<IBrowserOpener>('IBrowserOpener');
  opener.open(`${url}/applications`);
}
