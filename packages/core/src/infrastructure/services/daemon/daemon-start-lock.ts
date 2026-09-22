/**
 * Daemon Start Lock
 *
 * Cross-process mutex for `shep start`. Without it two concurrent starts both
 * saw "no live daemon", both probed the same free port, both spawned, and the
 * loser overwrote daemon.json with a pid that died on EADDRINUSE — leaving the
 * real daemon untracked (and rotating daemon.log out from under it).
 *
 * The lock is a file created with O_EXCL that holds the owner's pid. A lock
 * whose pid is no longer alive — or whose contents stay unreadable past a
 * short grace period — is stale and is taken over. Callers hold the lock across "check daemon.json → pick
 * port → spawn → write daemon.json" so the next starter sees the result.
 */

import { mkdirSync, readFileSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { getShepHomeDir } from '../filesystem/shep-directory.service.js';

export const DAEMON_START_LOCK_FILENAME = 'daemon.start.lock';
/**
 * Longer than one full start by a margin: the holder may wait the settle
 * window plus the 30s readiness budget before it writes daemon.json.
 */
export const DAEMON_START_LOCK_TIMEOUT_MS = 45_000;
export const DAEMON_START_LOCK_POLL_MS = 100;

/**
 * A lock file with no readable pid may be one another process has created
 * but not yet written; only treat it as stale once it is this old.
 */
export const DAEMON_START_LOCK_UNREADABLE_GRACE_MS = 2_000;

const EXCLUSIVE_CREATE_FLAG = 'wx';
const OWNER_ONLY_MODE = 0o600;

export class DaemonStartLockTimeoutError extends Error {
  constructor(lockPath: string, holderPid: number | null, timeoutMs: number) {
    super(
      `Another "shep start" (pid ${holderPid ?? 'unknown'}) is still starting the daemon; ` +
        `gave up waiting after ${timeoutMs}ms. Remove ${lockPath} if no start is in progress.`
    );
    this.name = 'DaemonStartLockTimeoutError';
  }
}

export interface DaemonStartLock {
  /** Remove the lock file — only if it is still ours. Idempotent. */
  release(): void;
}

export interface AcquireDaemonStartLockOptions {
  isAlive: (pid: number) => boolean;
  pid?: number;
  timeoutMs?: number;
  pollMs?: number;
}

export function getDaemonStartLockPath(): string {
  return join(getShepHomeDir(), DAEMON_START_LOCK_FILENAME);
}

function readHolderPid(lockPath: string): number | null {
  try {
    const pid = Number.parseInt(readFileSync(lockPath, 'utf8').trim(), 10);
    return Number.isInteger(pid) && pid > 0 ? pid : null;
  } catch {
    return null;
  }
}

function errnoCode(error: unknown): string | undefined {
  return (error as NodeJS.ErrnoException)?.code;
}

function tryCreate(lockPath: string, pid: number): boolean {
  try {
    writeFileSync(lockPath, String(pid), { flag: EXCLUSIVE_CREATE_FLAG, mode: OWNER_ONLY_MODE });
    return true;
  } catch (error) {
    if (errnoCode(error) === 'EEXIST') return false;
    throw error;
  }
}

function removeIfHeldBy(lockPath: string, pid: number | null): void {
  // Re-read right before unlinking so we never delete a lock someone else
  // took over in the meantime (the window is a single read + unlink).
  if (readHolderPid(lockPath) !== pid) return;
  try {
    unlinkSync(lockPath);
  } catch (error) {
    if (errnoCode(error) !== 'ENOENT') throw error;
  }
}

function isOlderThan(lockPath: string, ageMs: number): boolean {
  try {
    return Date.now() - statSync(lockPath).mtimeMs >= ageMs;
  } catch {
    return true; // gone — nothing to wait for
  }
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Acquire the start lock, waiting while a live process holds it and taking
 * over a stale one. Rejects with DaemonStartLockTimeoutError on timeout.
 */
export async function acquireDaemonStartLock(
  lockPath: string,
  options: AcquireDaemonStartLockOptions
): Promise<DaemonStartLock> {
  const pid = options.pid ?? process.pid;
  const timeoutMs = options.timeoutMs ?? DAEMON_START_LOCK_TIMEOUT_MS;
  const pollMs = options.pollMs ?? DAEMON_START_LOCK_POLL_MS;
  const deadline = Date.now() + timeoutMs;

  mkdirSync(dirname(lockPath), { recursive: true });

  for (;;) {
    if (tryCreate(lockPath, pid)) {
      let released = false;
      return {
        release: () => {
          if (released) return;
          released = true;
          removeIfHeldBy(lockPath, pid);
        },
      };
    }

    const holder = readHolderPid(lockPath);
    const stale =
      holder === null
        ? isOlderThan(lockPath, DAEMON_START_LOCK_UNREADABLE_GRACE_MS)
        : !options.isAlive(holder);
    if (stale) {
      removeIfHeldBy(lockPath, holder);
      continue;
    }

    if (Date.now() >= deadline) {
      throw new DaemonStartLockTimeoutError(lockPath, holder, timeoutMs);
    }
    await sleep(pollMs);
  }
}
