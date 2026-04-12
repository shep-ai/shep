/**
 * startDaemon() — Shared daemon-spawn helper
 *
 * Contains the parent-side logic for starting the Shep web UI as a
 * detached background daemon. Used by both:
 *   - The default `shep` action (index.ts)
 *   - The `shep start` command (start.command.ts)
 *
 * Flow:
 *   1. Resolve available port (respects --port override)
 *   2. Check if daemon is already running (idempotent — print URL and return)
 *   3. Spawn the daemon with execArgv propagated (supports tsx in dev mode)
 *      {detached: true, stdio: ['ignore','ignore','pipe']} + child.unref()
 *   4. Wait briefly to confirm the child is alive; surface stderr on crash
 *   5. Write daemon.json atomically via IDaemonService
 *   6. Print formatted URL to stdout
 *   7. Open browser via IBrowserOpener (resolved from DI container)
 */

import { spawn } from 'node:child_process';
import { closeSync, openSync, renameSync, existsSync } from 'node:fs';
import http from 'node:http';
import { container } from '@/infrastructure/di/container.js';
import { findAvailablePort, DEFAULT_PORT } from '@/infrastructure/services/port.service.js';
import { getDaemonLogPath } from '@/infrastructure/services/filesystem/shep-directory.service.js';
import { fmt, messages, spinner } from '../../ui/index.js';
import type { IDaemonService } from '@/application/ports/output/services/daemon-service.interface.js';
import type { IBrowserOpener } from '@/application/ports/output/services/i-browser-opener.js';
import { getCliI18n } from '../../i18n.js';

/** How long to wait (ms) after spawn to verify the child is still alive. */
const SPAWN_SETTLE_MS = 500;

/** Max time (ms) to wait for the server to become reachable before opening the browser. */
const READY_TIMEOUT_MS = 30_000;
/** Interval (ms) between readiness probes. */
const READY_POLL_MS = 300;

export interface StartDaemonOptions {
  port?: number;
}

/**
 * Start the Shep web UI as a detached background daemon.
 * Idempotent: if a daemon is already running, prints the existing URL and returns.
 */
export async function startDaemon(opts: StartDaemonOptions = {}): Promise<void> {
  const t = getCliI18n().t;
  const daemonService = container.resolve<IDaemonService>('IDaemonService');

  // Check for an already-running daemon
  const existing = await daemonService.read();
  if (existing && daemonService.isAlive(existing.pid)) {
    const url = `http://localhost:${existing.port}`;
    messages.newline();
    messages.info(t('cli:ui.daemon.alreadyRunning', { url: fmt.code(url) }));
    messages.newline();
    return;
  }

  // Resolve the port
  const startPort = opts.port ?? DEFAULT_PORT;
  const port = await findAvailablePort(startPort);

  // Rotate existing daemon.log → daemon.log.old (keep 1 backup)
  const logPath = getDaemonLogPath();
  try {
    if (existsSync(logPath)) {
      renameSync(logPath, `${logPath}.old`);
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
  const exitCode = await Promise.race([
    new Promise<number | null>((resolve) => child.on('exit', (code) => resolve(code))),
    new Promise<undefined>((resolve) => setTimeout(() => resolve(undefined), SPAWN_SETTLE_MS)),
  ]);

  if (exitCode !== undefined) {
    // Child exited during the settle window — startup failed.
    closeSync(logFd);
    messages.newline();
    messages.error(t('cli:ui.daemon.daemonFailed', { code: exitCode ?? 'unknown' }));
    messages.info(t('cli:ui.daemon.checkLogs', { path: fmt.code(logPath) }));
    messages.newline();
    // Clean up stale daemon.json if it exists
    await daemonService.delete();
    return;
  }

  // Child is alive — close the log fd in the parent and detach fully.
  closeSync(logFd);
  child.unref();

  // Write daemon.json atomically
  await daemonService.write({
    pid: child.pid!,
    port,
    startedAt: new Date().toISOString(),
  });

  const url = `http://localhost:${port}`;
  messages.newline();
  console.log(fmt.heading(t('cli:ui.daemon.heading')));
  messages.newline();

  // Poll until the server responds, with a spinner on stderr.
  // Skip readiness check in E2E / CI environments where the daemon child
  // cannot actually start a Next.js server within the test's time window.
  if (process.env.SHEP_SKIP_READINESS_CHECK) {
    messages.success(t('cli:ui.daemon.daemonSpawned', { url: fmt.code(url) }));
  } else {
    const ready = await spinner(t('cli:ui.daemon.startingServer'), () =>
      waitForServer(url, READY_TIMEOUT_MS)
    );

    if (ready) {
      messages.success(t('cli:ui.daemon.serverReady', { url: fmt.code(url) }));
    } else {
      messages.warning(t('cli:ui.daemon.serverMayBeStarting', { url: fmt.code(url) }));
    }
  }
  messages.newline();

  const opener = container.resolve<IBrowserOpener>('IBrowserOpener');
  opener.open(url);
}

/**
 * Poll a URL until it returns any HTTP response (even 500).
 * Resolves true when reachable, false on timeout.
 */
function waitForServer(url: string, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;

  return new Promise((resolve) => {
    const probe = () => {
      if (Date.now() > deadline) return resolve(false);

      const req = http.get(url, (res) => {
        // Drain the response so the socket doesn't keep the event loop alive
        res.resume();
        res.on('end', () => resolve(true));
      });
      req.on('error', () => {
        setTimeout(probe, READY_POLL_MS);
      });
      req.setTimeout(2000, () => {
        req.destroy();
        setTimeout(probe, READY_POLL_MS);
      });
    };
    probe();
  });
}
