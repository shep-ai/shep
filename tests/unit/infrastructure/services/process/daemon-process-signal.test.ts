/**
 * signalDaemonProcesses Unit Tests
 *
 * The daemon forks the feature workers, so any kill that follows parentage
 * (`tree-kill`, `taskkill /T`) reaches them. These pin the two platform
 * branches that avoid it; the real-process proof is
 * tests/integration/services/stop-daemon.feature-workers.test.ts.
 */

import { describe, it, expect, vi } from 'vitest';
import {
  signalDaemonProcesses,
  type DaemonSignalDeps,
} from '@/infrastructure/services/process/daemon-process-signal.js';

const PID = 777;

function deps(overrides: Partial<DaemonSignalDeps> = {}): DaemonSignalDeps {
  return {
    isWindows: false,
    kill: vi.fn(),
    forceKillOne: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe('signalDaemonProcesses', () => {
  it("signals the daemon's process group on Unix — detached workers are not in it", async () => {
    const d = deps();

    await signalDaemonProcesses(PID, 'SIGTERM', d);

    expect(d.kill).toHaveBeenCalledWith(-PID, 'SIGTERM');
    expect(d.kill).toHaveBeenCalledTimes(1);
  });

  it('falls back to the daemon alone when it does not lead a group', async () => {
    const d = deps({
      kill: vi.fn((pid: number) => {
        if (pid < 0) throw Object.assign(new Error('ESRCH'), { code: 'ESRCH' });
      }),
    });

    await signalDaemonProcesses(PID, 'SIGKILL', d);

    expect(d.kill).toHaveBeenLastCalledWith(PID, 'SIGKILL');
  });

  it('force-kills only the daemon on Windows — never the tree', async () => {
    const d = deps({ isWindows: true });

    await signalDaemonProcesses(PID, 'SIGTERM', d);

    expect(d.forceKillOne).toHaveBeenCalledWith(PID);
    expect(d.kill).not.toHaveBeenCalled();
  });

  it('never rejects when the daemon is already gone', async () => {
    const d = deps({
      kill: vi.fn(() => {
        throw Object.assign(new Error('ESRCH'), { code: 'ESRCH' });
      }),
    });

    await expect(signalDaemonProcesses(PID, 'SIGTERM', d)).resolves.toBeUndefined();
  });
});
