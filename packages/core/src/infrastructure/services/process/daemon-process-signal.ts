/**
 * Daemon process signalling for `shep stop` / `restart` / `upgrade`.
 *
 * Stopping the daemon must not stop the feature workers it forked. They are
 * forked `detached`, but their parent pid is still the daemon, so a tree kill
 * that follows parentage (`tree-kill` on Unix, `taskkill /T` on Windows)
 * reached every one of them: restarting the UI killed every running feature
 * agent, and an agent that ran `shep restart` in its worktree killed itself.
 *
 * - Unix: the daemon is spawned `detached`, so it leads its own process group.
 *   Signalling the GROUP reaches the daemon and everything it runs in-process
 *   or as a plain child — and nothing that set up a group of its own, which is
 *   exactly the feature workers (and the dev servers, which the daemon's own
 *   SIGTERM handler stops, and which the next daemon re-adopts otherwise).
 * - Windows: there is no process group to signal and no graceful stop
 *   (`taskkill` without `/F` cannot end a windowless process). Only the daemon
 *   itself is force-killed; its children survive, like a worker must.
 */

import { execFile } from 'node:child_process';
import { IS_WINDOWS } from '../../platform.js';

export type DaemonSignal = 'SIGTERM' | 'SIGKILL';

/** Process primitives, injectable for tests. */
export interface DaemonSignalDeps {
  isWindows: boolean;
  /** `process.kill` semantics: negative pid = process group; throws when absent. */
  kill: (pid: number, signal: DaemonSignal) => void;
  /** Force-kill one Windows process (no `/T`); resolves once taskkill returned. */
  forceKillOne: (pid: number) => Promise<void>;
}

const defaultDeps: DaemonSignalDeps = {
  isWindows: IS_WINDOWS,
  kill: (pid, signal) => {
    process.kill(pid, signal);
  },
  forceKillOne: (pid) =>
    new Promise<void>((resolve) => {
      execFile('taskkill', ['/F', '/PID', String(pid)], { windowsHide: true }, () => resolve());
    }),
};

/**
 * Signal the daemon and its own process group — never the feature workers.
 * Never rejects: a daemon that already exited is the expected case.
 */
export async function signalDaemonProcesses(
  pid: number,
  signal: DaemonSignal,
  deps: DaemonSignalDeps = defaultDeps
): Promise<void> {
  if (deps.isWindows) {
    await deps.forceKillOne(pid);
    return;
  }
  try {
    deps.kill(-pid, signal);
  } catch {
    // Not a group leader (started some other way) — signal the daemon alone.
    try {
      deps.kill(pid, signal);
    } catch {
      // Already gone.
    }
  }
}
