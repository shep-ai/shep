/**
 * Make a fake child process exit only when it is killed.
 *
 * Models an agent CLI that emitted its terminal event and then lingered (MCP
 * children, a backgrounded dev server): nothing happens until the executor
 * kills it, and then it exits in real Node order — stdio ends before `close`.
 */

import type { PassThrough } from 'node:stream';
import type { EventEmitter } from 'node:events';

/** The shape every executor test's `createMockChildProcess()` returns. */
export interface KillableFakeProcess extends EventEmitter {
  stdout: PassThrough;
  stderr: PassThrough;
  /** A `vi.fn()`; only its implementation is replaced. */
  kill: { mockImplementation(impl: () => boolean): unknown };
}

/** How the killed process reports its exit on `close`. */
export interface ExitReport {
  code: number | null;
  signal: NodeJS.Signals | null;
}

/** A signal kill on POSIX. */
export const KILLED_BY_SIGTERM: ExitReport = { code: null, signal: 'SIGTERM' };

/** What `taskkill /F` leaves behind on Windows: exit code 1, no signal. */
export const KILLED_BY_TASKKILL: ExitReport = { code: 1, signal: null };

export function exitOnKill<T extends KillableFakeProcess>(
  proc: T,
  report: ExitReport = KILLED_BY_SIGTERM
): T {
  let exited = false;
  proc.kill.mockImplementation(() => {
    if (exited) return false;
    exited = true;
    process.nextTick(() => {
      proc.stdout.end();
      proc.stderr.end();
      proc.emit('close', report.code, report.signal);
    });
    return true;
  });
  return proc;
}
