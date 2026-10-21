/**
 * Post-Result Exit Guard
 *
 * Every one-shot agent CLI ends a turn with a terminal event (Claude, Copilot,
 * Cursor and Gemini `result`, Codex `turn.completed`) and is then supposed to
 * exit. In practice it often lingers: MCP servers, language servers and dev
 * servers the agent backgrounded keep it alive, and an executor that waits
 * only for `close` then hangs for hours with the answer already in hand.
 *
 * `watchPostResultExit` is the one bound on that teardown for every subprocess
 * executor: armed on the terminal event, it terminates a process that has not
 * closed within the grace period, so the executor's `close` handler runs and
 * settles the run with the result it already captured.
 */

import type { ChildProcess } from 'node:child_process';
import { terminateWithEscalation, type KillOptions } from './process-stream.js';

/**
 * How long a process may take to exit after its terminal event.
 *
 * Generous enough for a CLI to flush its session file and stop its MCP
 * servers; anything longer is a leaked child, not teardown.
 */
export const RESULT_TO_CLOSE_GRACE_MS = 30_000;

/** Terminal event named in the log line when the caller does not say. */
const DEFAULT_TERMINAL_EVENT = 'result';

/** Milliseconds per second, for rendering the grace period in the log. */
const MS_PER_SECOND = 1000;

/** Tuning for {@link watchPostResultExit}. */
export interface PostResultExitOptions extends KillOptions {
  /** Defaults to {@link RESULT_TO_CLOSE_GRACE_MS}. */
  graceMs?: number;
  /** The CLI's terminal event type, named in the log. Defaults to `result`. */
  terminalEvent?: string;
}

/** A guard over one spawned agent's exit after its terminal event. */
export interface PostResultExitGuard {
  /** Start the grace period. Only the first call counts; a closed process is never armed. */
  arm(): void;
  /** True once the guard itself terminated the process. */
  readonly killed: boolean;
  /**
   * The exit code as the executor's outcome rules should read it: `null` (a
   * signal) when the guard's own kill ended the process. A Windows taskkill
   * exits the process with 1, and a CLI trapping SIGTERM may exit non-zero —
   * either is this teardown, not the agent's verdict on its turn.
   */
  exitCode(code: number | null): number | null;
  /** Cancel a pending kill and its SIGKILL escalation. Idempotent. */
  stop(): void;
}

/**
 * True when the process already exited, whether or not its stdio closed.
 * Node sets one of the two once `exit` fires; until then both are `null`.
 */
function hasExited(proc: ChildProcess): boolean {
  return typeof proc.exitCode === 'number' || typeof proc.signalCode === 'string';
}

/**
 * Bound how long `proc` may linger after its terminal event.
 *
 * Create it right after spawning and call {@link PostResultExitGuard.arm}
 * when the terminal event arrives. The guard disarms itself when the process
 * closes or fails to spawn, its timer is `unref`'d, and the kill goes through
 * {@link terminateWithEscalation} (tree kill on Windows, SIGKILL if ignored).
 *
 * A process that already exited while a leaked child still holds its stdout
 * open never emits `close`, and signalling its pid would do nothing (or hit a
 * reused pid), so in that case the guard closes the pipes on this side instead.
 *
 * @param log - The run's logger; every action the guard takes is logged
 */
export function watchPostResultExit(
  proc: ChildProcess,
  log: (message: string) => void,
  options: PostResultExitOptions = {}
): PostResultExitGuard {
  const graceMs = options.graceMs ?? RESULT_TO_CLOSE_GRACE_MS;
  const terminalEvent = options.terminalEvent ?? DEFAULT_TERMINAL_EVENT;
  let armed = false;
  let stopped = false;
  let killed = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let cancelEscalation: (() => void) | undefined;

  const stop = (): void => {
    if (stopped) return;
    stopped = true;
    if (timer) clearTimeout(timer);
    cancelEscalation?.();
  };

  const expire = (): void => {
    const deadline = `${graceMs / MS_PER_SECOND}s of [${terminalEvent}]`;
    if (hasExited(proc)) {
      log(`Subprocess exited but its output still held open ${deadline} later — closing it`);
      proc.stdin?.destroy();
      proc.stdout?.destroy();
      proc.stderr?.destroy();
      return;
    }
    log(`Subprocess did not exit within ${deadline} — terminating`);
    killed = true;
    cancelEscalation = terminateWithEscalation(proc, options);
  };

  proc.once('close', stop);
  proc.once('error', stop);

  return {
    arm(): void {
      if (armed || stopped) return;
      armed = true;
      timer = setTimeout(expire, graceMs);
      timer.unref?.();
    },
    get killed() {
      return killed;
    },
    exitCode(code: number | null): number | null {
      return killed ? null : code;
    },
    stop,
  };
}
