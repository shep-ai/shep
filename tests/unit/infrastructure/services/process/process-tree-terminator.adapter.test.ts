/**
 * ProcessTreeTerminatorAdapter Unit Tests
 *
 * The escalation logic, with every process primitive faked. Real process trees
 * are exercised in tests/integration/application/use-cases/agents/
 * stop-agent-run.process-tree.test.ts.
 */

import { describe, it, expect, vi } from 'vitest';
import {
  ProcessTreeTerminatorAdapter,
  type ProcessTreeTerminatorDeps,
} from '@/infrastructure/services/process/process-tree-terminator.adapter.js';

const PID = 4242;
const GRACE_MS = 1000;
const POLL_MS = 100;

/**
 * A fake process table: `alive` says whether the worker's pid and its process
 * group still exist, and each signal may end them.
 */
function fakeDeps(options: {
  isWindows?: boolean;
  /** Signals the tree obeys; any other signal is ignored. */
  obeys: readonly string[];
}): ProcessTreeTerminatorDeps & { calls: string[] } {
  let alive = true;
  const calls: string[] = [];
  const obey = (signal: string) => {
    if (options.obeys.includes(signal)) alive = false;
  };
  return {
    calls,
    isWindows: options.isWindows ?? false,
    graceMs: GRACE_MS,
    pollMs: POLL_MS,
    treeKill: vi.fn(async (pid: number, signal: string) => {
      calls.push(`tree ${pid} ${signal}`);
      obey(signal);
    }),
    kill: vi.fn((pid: number, signal: NodeJS.Signals | 0) => {
      if (signal === 0) {
        if (!alive) throw Object.assign(new Error('ESRCH'), { code: 'ESRCH' });
        return;
      }
      calls.push(`kill ${pid} ${signal}`);
      obey(signal);
    }),
    sleep: vi.fn(async () => undefined),
  };
}

describe('ProcessTreeTerminatorAdapter', () => {
  it('asks the tree and the process group to stop, and stops there when they do', async () => {
    const deps = fakeDeps({ obeys: ['SIGTERM', 'SIGKILL'] });

    await new ProcessTreeTerminatorAdapter(deps).terminateTree(PID);

    expect(deps.calls).toEqual([`tree ${PID} SIGTERM`, `kill ${-PID} SIGTERM`]);
  });

  it('escalates the tree and the group to SIGKILL after the grace period', async () => {
    const deps = fakeDeps({ obeys: ['SIGKILL'] });

    await new ProcessTreeTerminatorAdapter(deps).terminateTree(PID);

    expect(deps.calls).toEqual([
      `tree ${PID} SIGTERM`,
      `kill ${-PID} SIGTERM`,
      `tree ${PID} SIGKILL`,
      `kill ${-PID} SIGKILL`,
    ]);
    // Polled for the whole grace, not a moment longer.
    expect(deps.sleep).toHaveBeenCalledTimes(GRACE_MS / POLL_MS);
  });

  it('kills at once when forced — a wedged event loop never runs its SIGTERM handler', async () => {
    const deps = fakeDeps({ obeys: ['SIGKILL'] });

    await new ProcessTreeTerminatorAdapter(deps).terminateTree(PID, { force: true });

    expect(deps.calls).toEqual([`tree ${PID} SIGKILL`, `kill ${-PID} SIGKILL`]);
    expect(deps.sleep).not.toHaveBeenCalled();
  });

  it('does one forced tree kill on Windows — there is no graceful signal to wait on', async () => {
    const deps = fakeDeps({ isWindows: true, obeys: [] });

    await new ProcessTreeTerminatorAdapter(deps).terminateTree(PID);

    expect(deps.calls).toEqual([`tree ${PID} SIGKILL`]);
    expect(deps.sleep).not.toHaveBeenCalled();
  });

  it('never rejects when the process is already gone', async () => {
    const deps = fakeDeps({ obeys: ['SIGTERM'] });
    deps.treeKill = vi.fn(async () => {
      throw new Error('ESRCH');
    });
    deps.kill = vi.fn(() => {
      throw Object.assign(new Error('ESRCH'), { code: 'ESRCH' });
    });

    await expect(new ProcessTreeTerminatorAdapter(deps).terminateTree(PID)).resolves.toBe(
      undefined
    );
  });
});
