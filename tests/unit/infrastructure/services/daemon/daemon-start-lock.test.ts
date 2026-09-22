/**
 * Daemon start lock — serialises concurrent `shep start` invocations so two
 * of them cannot both pick the same port and overwrite each other's
 * daemon.json. Real filesystem, real O_EXCL semantics.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  acquireDaemonStartLock,
  DaemonStartLockTimeoutError,
  DAEMON_START_LOCK_UNREADABLE_GRACE_MS,
} from '@/infrastructure/services/daemon/daemon-start-lock.js';

const OUR_PID = 1111;
const OTHER_LIVE_PID = 2222;
const DEAD_PID = 3333;
const POLL_MS = 5;
const SHORT_TIMEOUT_MS = 60;
const RELEASE_AFTER_MS = 20;

const isAlive = (pid: number) => pid === OUR_PID || pid === OTHER_LIVE_PID;

describe('acquireDaemonStartLock', () => {
  let dir: string;
  let lockPath: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'shep-start-lock-'));
    lockPath = join(dir, 'daemon.start.lock');
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  function acquire(pid = OUR_PID, timeoutMs = SHORT_TIMEOUT_MS) {
    return acquireDaemonStartLock(lockPath, { pid, isAlive, pollMs: POLL_MS, timeoutMs });
  }

  it('creates the lock file holding our pid and removes it on release', async () => {
    const lock = await acquire();
    expect(readFileSync(lockPath, 'utf8').trim()).toBe(String(OUR_PID));
    lock.release();
    expect(existsSync(lockPath)).toBe(false);
  });

  it('times out while a live process holds the lock', async () => {
    writeFileSync(lockPath, String(OTHER_LIVE_PID));
    await expect(acquire()).rejects.toBeInstanceOf(DaemonStartLockTimeoutError);
    expect(readFileSync(lockPath, 'utf8').trim()).toBe(String(OTHER_LIVE_PID));
  });

  it('waits for the holder to release, then acquires', async () => {
    const first = await acquire(OTHER_LIVE_PID);
    const second = acquire(OUR_PID, SHORT_TIMEOUT_MS * 10);
    setTimeout(() => first.release(), RELEASE_AFTER_MS);

    const lock = await second;
    expect(readFileSync(lockPath, 'utf8').trim()).toBe(String(OUR_PID));
    lock.release();
  });

  it('recovers a stale lock left by a dead process', async () => {
    writeFileSync(lockPath, String(DEAD_PID));
    const lock = await acquire();
    expect(readFileSync(lockPath, 'utf8').trim()).toBe(String(OUR_PID));
    lock.release();
  });

  it('recovers a lock file whose contents stayed unreadable past the grace period', async () => {
    writeFileSync(lockPath, 'garbage');
    const past = (Date.now() - DAEMON_START_LOCK_UNREADABLE_GRACE_MS) / 1000;
    utimesSync(lockPath, past, past);
    const lock = await acquire();
    expect(readFileSync(lockPath, 'utf8').trim()).toBe(String(OUR_PID));
    lock.release();
  });

  it('does not steal a just-created lock whose pid has not been written yet', async () => {
    writeFileSync(lockPath, '');
    await expect(acquire()).rejects.toBeInstanceOf(DaemonStartLockTimeoutError);
    expect(existsSync(lockPath)).toBe(true);
  });

  it('release does not delete a lock another process now holds', async () => {
    const lock = await acquire();
    writeFileSync(lockPath, String(OTHER_LIVE_PID));
    lock.release();
    expect(readFileSync(lockPath, 'utf8').trim()).toBe(String(OTHER_LIVE_PID));
  });
});
