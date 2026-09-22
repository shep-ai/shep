/**
 * ProcessTreeTerminatorAdapter
 *
 * Concrete `IProcessTreeTerminator`. Every signal goes two ways on Unix:
 *
 * - down the parentage tree (`tree-kill`), which reaches descendants that put
 *   themselves in a process group of their own;
 * - to the target's process GROUP (`kill(-pid)`). A feature worker is forked
 *   `detached`, so it leads its own group and the agent CLIs it spawns are in
 *   it. The group still reaches them after the worker itself has died and they
 *   were re-parented away from it — the parentage walk no longer can.
 *
 * Windows has no graceful signal (`tree-kill` always runs `taskkill /T /F`), so
 * there it is a single awaited forced tree kill — see LESSONS "Windows has no
 * graceful kill — don't simulate one".
 */

import treeKill from 'tree-kill';
import type {
  IProcessTreeTerminator,
  ProcessTreeTerminationOptions,
} from '../../../application/ports/output/services/process-tree-terminator.interface.js';
import { IS_WINDOWS } from '../../platform.js';

/**
 * How long a tree may take to exit after SIGTERM before it is SIGKILLed.
 *
 * A feature worker's SIGTERM handler makes one guarded DB write and exits, so
 * it is normally gone in milliseconds; 5s matches the daemon stop and the
 * executors' own escalation (`SIGKILL_GRACE_MS`), long enough for an agent CLI
 * to flush and close its MCP children.
 */
export const TREE_TERMINATION_GRACE_MS = 5_000;

/** Liveness poll interval while waiting out the grace period. */
export const TREE_TERMINATION_POLL_MS = 200;

type TreeSignal = 'SIGTERM' | 'SIGKILL';

/** Process primitives, injectable so the escalation logic is testable without real processes. */
export interface ProcessTreeTerminatorDeps {
  isWindows: boolean;
  graceMs: number;
  pollMs: number;
  /** Signal `pid` and its descendants; resolves once the signals were sent. */
  treeKill: (pid: number, signal: TreeSignal) => Promise<void>;
  /** `process.kill` semantics: negative pid = process group, signal 0 = probe, throws when absent. */
  kill: (pid: number, signal: NodeJS.Signals | 0) => void;
  sleep: (ms: number) => Promise<void>;
}

const defaultDeps: ProcessTreeTerminatorDeps = {
  isWindows: IS_WINDOWS,
  graceMs: TREE_TERMINATION_GRACE_MS,
  pollMs: TREE_TERMINATION_POLL_MS,
  treeKill: (pid, signal) =>
    new Promise<void>((resolve) => {
      // The callback fires once `kill`/`taskkill` actually returned; an error
      // means the pid is already gone, which is what we wanted anyway.
      treeKill(pid, signal, () => resolve());
    }),
  kill: (pid, signal) => {
    process.kill(pid, signal);
  },
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
};

export class ProcessTreeTerminatorAdapter implements IProcessTreeTerminator {
  private readonly deps: ProcessTreeTerminatorDeps;

  constructor(deps: Partial<ProcessTreeTerminatorDeps> = {}) {
    this.deps = { ...defaultDeps, ...deps };
  }

  async terminateTree(pid: number, options?: ProcessTreeTerminationOptions): Promise<void> {
    if (this.deps.isWindows) {
      await this.signalTree(pid, 'SIGKILL');
      return;
    }

    if (options?.force === true) {
      await this.signalTree(pid, 'SIGKILL');
      return;
    }

    await this.signalTree(pid, 'SIGTERM');
    if (await this.waitForExit(pid)) return;
    await this.signalTree(pid, 'SIGKILL');
  }

  private async signalTree(pid: number, signal: TreeSignal): Promise<void> {
    try {
      await this.deps.treeKill(pid, signal);
    } catch {
      // Already gone — the expected case.
    }
    if (this.deps.isWindows) return;
    try {
      this.deps.kill(-pid, signal);
    } catch {
      // Not a group leader, or the group is already empty.
    }
  }

  /** True once neither the process nor anything left in its group is alive. */
  private async waitForExit(pid: number): Promise<boolean> {
    const attempts = Math.ceil(this.deps.graceMs / this.deps.pollMs);
    for (let attempt = 0; ; attempt++) {
      // Check before sleeping: the normal case is a worker that exits at once.
      if (!this.exists(pid) && !this.exists(-pid)) return true;
      if (attempt >= attempts) return false;
      await this.deps.sleep(this.deps.pollMs);
    }
  }

  private exists(pidOrGroup: number): boolean {
    try {
      this.deps.kill(pidOrGroup, 0);
      return true;
    } catch {
      return false;
    }
  }
}
