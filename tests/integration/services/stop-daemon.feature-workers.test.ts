/**
 * `shep stop` / `restart` / `upgrade` must not take feature workers down
 *
 * Feature workers are forked by the daemon (`detached`, so each leads its own
 * process group) but their parent pid is the daemon. `stopDaemon()` used to
 * tree-kill the daemon by parentage, which reached every worker it had forked:
 * restarting the UI killed every running feature agent — and an agent that ran
 * `shep restart` inside its worktree killed itself.
 *
 * Real processes, because the defect is in how signals travel between them:
 * a detached "daemon" that forks a detached "worker" (the feature-worker shape)
 * and a plain child (the shape of anything else the daemon runs).
 */

import { describe, it, expect, afterEach, vi } from 'vitest';
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { IDaemonService } from '@/application/ports/output/services/daemon-service.interface.js';
import { removeDirWithRetry } from '../../helpers/remove-dir.helper.js';

vi.mock('../../../src/presentation/cli/ui/index.js', () => ({
  messages: { info: vi.fn(), success: vi.fn(), warning: vi.fn(), error: vi.fn() },
}));

import { stopDaemon } from '../../../src/presentation/cli/commands/daemon/stop-daemon.js';

const WAIT_BUDGET_MS = 10_000;
const POLL_MS = 50;
const IDLE = 'setInterval(() => {}, 1000);';

function daemonScript(pidFile: string): string {
  return `
    const { spawn } = require('node:child_process');
    const { writeFileSync } = require('node:fs');
    const worker = spawn(process.execPath, ['-e', ${JSON.stringify(IDLE)}], { detached: true, stdio: 'ignore' });
    const child = spawn(process.execPath, ['-e', ${JSON.stringify(IDLE)}], { stdio: 'ignore' });
    writeFileSync(${JSON.stringify(pidFile)}, JSON.stringify({ worker: worker.pid, child: child.pid }));
    ${IDLE}
  `;
}

/** Alive and not a zombie waiting for a reaper that may never come in a container. */
function isRunning(pid: number): boolean {
  try {
    process.kill(pid, 0);
  } catch {
    return false;
  }
  if (process.platform !== 'linux') return true;
  try {
    const stat = readFileSync(`/proc/${pid}/stat`, 'utf8');
    return stat.slice(stat.lastIndexOf(')') + 2, stat.lastIndexOf(')') + 3) !== 'Z';
  } catch {
    return false;
  }
}

async function waitFor(predicate: () => boolean): Promise<boolean> {
  const deadline = Date.now() + WAIT_BUDGET_MS;
  while (Date.now() < deadline) {
    if (predicate()) return true;
    await new Promise((resolve) => setTimeout(resolve, POLL_MS));
  }
  return predicate();
}

describe.skipIf(process.platform === 'win32')('stopDaemon — feature workers survive', () => {
  const spawned: number[] = [];
  let dir: string | undefined;

  afterEach(() => {
    for (const pid of spawned.splice(0)) {
      try {
        process.kill(pid, 'SIGKILL');
      } catch {
        // Already gone.
      }
    }
    if (dir) removeDirWithRetry(dir);
    dir = undefined;
  });

  it('stops the daemon and its own children, but not the feature workers it forked', async () => {
    dir = mkdtempSync(join(tmpdir(), 'shep-stop-daemon-'));
    const pidFile = join(dir, 'pids.json');
    const daemon = spawn(process.execPath, ['-e', daemonScript(pidFile)], {
      detached: true,
      stdio: 'ignore',
    });
    daemon.unref();
    spawned.push(daemon.pid!);
    expect(await waitFor(() => existsSync(pidFile))).toBe(true);
    const { worker, child } = JSON.parse(readFileSync(pidFile, 'utf8')) as {
      worker: number;
      child: number;
    };
    spawned.push(worker, child);

    const daemonService = {
      read: async () => ({ pid: daemon.pid!, port: 4050, startedAt: new Date().toISOString() }),
      write: async () => undefined,
      delete: async () => undefined,
      isAlive: (pid: number) => isRunning(pid),
    } as unknown as IDaemonService;

    await stopDaemon(daemonService);

    expect(await waitFor(() => !isRunning(daemon.pid!))).toBe(true);
    expect(await waitFor(() => !isRunning(child))).toBe(true);
    expect(isRunning(worker)).toBe(true);
  });
});
