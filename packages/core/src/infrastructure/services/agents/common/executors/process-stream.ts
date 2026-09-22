/**
 * Process Stream Helpers
 *
 * Shared plumbing for the CLI agent executors, which all spawn a child process
 * and read newline-delimited JSON from its stdout.
 *
 * Every executor previously hand-rolled the same chunk-to-line loop. Three
 * defects are easy to reintroduce each time it is copied:
 *
 *  1. A JSON object split across two stdout chunks is dropped or throws.
 *  2. A `Buffer.toString()` per chunk splits a multi-byte UTF-8 character that
 *     straddles the chunk boundary, corrupting the line.
 *  3. An agent that streams megabytes without ever emitting a newline grows the
 *     buffer without bound.
 *
 * `createLineAccumulator` solves all three once, so executors only have to say
 * what a line *means*.
 */

import { execFileSync } from 'node:child_process';
import { StringDecoder } from 'node:string_decoder';
import type { ChildProcess } from 'node:child_process';
import { IS_WINDOWS } from '../../../../platform.js';

/** Node's `spawn` stdio setting: parent owns all three streams. */
const STDIO_ALL_PIPES = ['pipe', 'pipe', 'pipe'] as const;

/**
 * Environment variable the Claude CLI reads to detect that it is already
 * running inside a Claude Code session; it refuses to start when it is set, so
 * every spawned agent gets an environment with it removed.
 */
const NESTED_SESSION_ENV_VAR = 'CLAUDECODE';

/** Error code Node reports when writing to a pipe whose reader has gone. */
const EPIPE_CODE = 'EPIPE';

/** Error code Node reports when a spawned binary is not on PATH. */
const ENOENT_CODE = 'ENOENT';

/**
 * Characters of stderr retained per process.
 *
 * Only the tail of stderr is ever read (it becomes the failure message), so an
 * agent that writes progress bars for an hour must not be allowed to grow the
 * worker's heap by the full volume.
 */
export const DEFAULT_MAX_STDERR_CHARS = 256 * 1024;

/** Grace period before escalating a terminated process from SIGTERM to SIGKILL. */
export const SIGKILL_GRACE_MS = 5_000;

/**
 * Default ceiling for a single un-terminated line, in bytes.
 *
 * Generous enough for any legitimate agent event (tool results routinely carry
 * whole files) while still bounding a runaway stream.
 */
export const DEFAULT_MAX_LINE_BYTES = 32 * 1024 * 1024;

/** Tuning for {@link createLineAccumulator}. */
export interface LineAccumulatorOptions {
  /** Maximum bytes buffered for one un-terminated line. */
  maxLineBytes?: number;
  /** Called with the number of bytes discarded when the ceiling is exceeded. */
  onOverflow?: (droppedBytes: number) => void;
}

/** Incremental newline-delimited reader over a child process stream. */
export interface LineAccumulator {
  /** Feed the next stdout/stderr chunk. */
  push(chunk: Buffer | string): void;
  /** Emit any trailing line that arrived without a newline. Idempotent. */
  flush(): void;
}

/**
 * Accumulate stream chunks and invoke `onLine` once per complete, non-blank
 * line. Blank and whitespace-only lines are skipped, and `\r\n` endings are
 * normalised so Windows agents parse identically.
 *
 * @param onLine - Receives each trimmed line.
 * @param options - Overflow ceiling and reporting.
 */
export function createLineAccumulator(
  onLine: (line: string) => void,
  options?: LineAccumulatorOptions
): LineAccumulator {
  const maxLineBytes = options?.maxLineBytes ?? DEFAULT_MAX_LINE_BYTES;
  const decoder = new StringDecoder('utf8');
  let buffer = '';
  /** True while discarding the remainder of a line that blew the ceiling. */
  let discarding = false;

  const emit = (raw: string): void => {
    const line = raw.trim();
    if (line.length > 0) onLine(line);
  };

  return {
    push(chunk: Buffer | string): void {
      // Route every chunk through the decoder so a multi-byte character split
      // across two Buffers is reassembled rather than turned into U+FFFD.
      buffer += decoder.write(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));

      let newlineIndex = buffer.indexOf('\n');
      while (newlineIndex !== -1) {
        const line = buffer.slice(0, newlineIndex);
        buffer = buffer.slice(newlineIndex + 1);
        // The tail of an over-long line is dropped, not emitted as a fragment —
        // a truncated JSON object would only fail to parse anyway.
        if (discarding) discarding = false;
        else emit(line);
        newlineIndex = buffer.indexOf('\n');
      }

      if (discarding) {
        // Keep discarding every chunk until its newline arrives. Retaining the
        // tail here would let an already-overflowed line grow without limit.
        buffer = '';
      } else if (Buffer.byteLength(buffer) > maxLineBytes) {
        const droppedBytes = Buffer.byteLength(buffer);
        buffer = '';
        discarding = true;
        options?.onOverflow?.(droppedBytes);
      }
    },

    flush(): void {
      buffer += decoder.end();
      if (!discarding && buffer.length > 0) emit(buffer);
      buffer = '';
      discarding = false;
    },
  };
}

/** Injection seam for {@link killProcessTree}, so tests need no real process. */
export interface KillOptions {
  /** Defaults to the host platform. */
  isWindows?: boolean;
  /** Defaults to `taskkill /F /T`. */
  treeKill?: (pid: number) => void;
}

/** Terminate a Windows process tree via taskkill. */
function taskkillTree(pid: number): void {
  execFileSync('taskkill', ['/F', '/T', '/PID', String(pid)], { stdio: 'ignore' });
}

/**
 * Kill a spawned agent and, on Windows, its whole process tree.
 *
 * `ChildProcess.kill()` signals only the direct child. Agent CLIs on Windows
 * are launched through a shell or wrapper script, so killing the child leaves
 * the real agent running — which is why a timeout there used to orphan a
 * process instead of stopping it.
 *
 * Never throws: a process that already exited is the expected case.
 */
export function killProcessTree(proc: ChildProcess, options?: KillOptions): void {
  const isWindows = options?.isWindows ?? IS_WINDOWS;
  const treeKill = options?.treeKill ?? taskkillTree;

  if (isWindows && proc.pid) {
    try {
      treeKill(proc.pid);
      return;
    } catch {
      // taskkill unavailable or the pid is already gone — fall through.
    }
  }

  try {
    proc.kill();
  } catch {
    // Already dead.
  }
}

/**
 * Terminate `proc`, then escalate to SIGKILL if it is still alive afterwards.
 *
 * SIGTERM is a request the child may ignore — an agent CLI blocked on an MCP
 * child routinely does. The escalation timer is `unref`'d so it can never keep
 * the worker alive on its own.
 *
 * @returns A function that cancels the pending escalation (call it once the
 *          process has actually closed).
 */
export function terminateWithEscalation(
  proc: ChildProcess,
  options?: KillOptions & { graceMs?: number }
): () => void {
  killProcessTree(proc, options);

  const timer = setTimeout(() => {
    try {
      proc.kill('SIGKILL');
    } catch {
      // Already gone — the expected case.
    }
  }, options?.graceMs ?? SIGKILL_GRACE_MS);
  timer.unref?.();

  return () => clearTimeout(timer);
}

/** Inputs to {@link buildSpawnOptions}. */
export interface SpawnOptionsInput {
  /** Working directory for the child; omitted from the options when absent. */
  cwd?: string;
  /** Variables merged over the inherited environment (e.g. an API key). */
  extraEnv?: Record<string, string>;
}

/**
 * Build the `spawn` options every CLI agent executor needs.
 *
 * `shell` is deliberately never set: it triggers DEP0190 argument escaping on
 * Windows and mangles prompts containing special characters. Every agent CLI
 * shep spawns is a native binary or a `.cmd` resolved by `spawn` itself.
 *
 * `process.platform` is read per call rather than at module load so a test can
 * exercise the Windows branch on Linux.
 */
export function buildSpawnOptions(input?: SpawnOptionsInput): Record<string, unknown> {
  const spawnOpts: Record<string, unknown> = { stdio: [...STDIO_ALL_PIPES] };

  if (input?.cwd) spawnOpts.cwd = input.cwd;
  if (process.platform === 'win32') spawnOpts.windowsHide = true;

  const { [NESTED_SESSION_ENV_VAR]: _nested, ...cleanEnv } = process.env;
  spawnOpts.env = input?.extraEnv ? { ...cleanEnv, ...input.extraEnv } : cleanEnv;

  return spawnOpts;
}

/**
 * Turn a child-process `error` event into the error the caller should see.
 *
 * ENOENT means the agent CLI is not installed, which is a user-actionable
 * setup problem rather than an execution failure, so it is replaced by the
 * executor's install hint. Everything else is passed through untouched.
 */
export function classifySpawnError(
  error: Error & { code?: string },
  notFoundMessage: string
): Error {
  return error.code === ENOENT_CODE ? new Error(notFoundMessage) : error;
}

/**
 * Write a prompt to the child's stdin and close it.
 *
 * Prompts are piped precisely because they are large, so a write is still in
 * flight when a CLI exits early (bad flag, auth failure, a timeout kill). The
 * resulting EPIPE is emitted on the stream, and a stream `error` with no
 * listener reaches `process.on('uncaughtException')` — killing the worker
 * instead of failing the run. Swallowing it here lets the `close`/`exit`
 * handler report the real reason the agent stopped.
 *
 * @param onError - Optional observer (logging); it must not rethrow.
 */
export function writePromptToStdin(
  proc: Pick<ChildProcess, 'stdin'>,
  prompt: string,
  onError?: (error: Error & { code?: string }) => void
): void {
  const { stdin } = proc;
  if (!stdin) return;

  stdin.on('error', (error: Error & { code?: string }) => {
    // EPIPE is the expected shape of "the agent exited before reading the
    // prompt"; anything else is still not worth crashing the worker for.
    onError?.(error);
  });

  try {
    stdin.write(prompt);
    stdin.end();
  } catch (error) {
    // A stream destroyed between the guard and the write throws synchronously.
    onError?.(error as Error & { code?: string });
  }
}

/** True when an error is the "agent exited before reading the prompt" case. */
export function isBrokenPipe(error: Error & { code?: string }): boolean {
  return error.code === EPIPE_CODE;
}

/** Bounded collector for a child's stderr. */
export interface StderrTail {
  /** Feed the next stderr chunk. */
  push(chunk: Buffer | string): void;
  /** The retained tail, decoded. */
  text(): string;
}

/**
 * Collect stderr, keeping only the most recent `maxChars`.
 *
 * Chunks go through a {@link StringDecoder} for the same reason stdout does: a
 * multi-byte character split across two reads would otherwise become U+FFFD in
 * the error message a human ends up reading.
 */
export function createStderrTail(maxChars: number = DEFAULT_MAX_STDERR_CHARS): StderrTail {
  const decoder = new StringDecoder('utf8');
  let buffer = '';

  return {
    push(chunk: Buffer | string): void {
      buffer += decoder.write(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      if (buffer.length > maxChars) buffer = buffer.slice(buffer.length - maxChars);
    },
    text(): string {
      return buffer;
    },
  };
}

/**
 * Describe a child that was killed by a signal instead of exiting.
 *
 * `close` reports `code === null` when the kernel killed the process — the OOM
 * killer, a `kill` from outside, a container stop. Treating that as a clean
 * exit resolves the run as a success with an empty result, so the message has
 * to name the signal and carry whatever the agent managed to say first.
 */
export function signalTerminationMessage(
  signal: NodeJS.Signals | null | undefined,
  stderrText: string
): string {
  const cause = signal ? `signal ${signal}` : 'an unknown signal';
  const detail = stderrText.trim();
  return `Agent process was terminated by ${cause} before producing a result.${
    detail ? ` ${detail}` : ''
  }`;
}

/**
 * Prefix of every executor timeout error.
 *
 * Retry classification (`feature-agent/nodes/node-helpers.ts`) matches on this
 * exact text to treat a timeout as non-retryable, so it must never change.
 */
export const AGENT_TIMEOUT_MESSAGE_PREFIX = 'Agent execution timed out';

/** Milliseconds per second, for rendering a budget in human units. */
const MS_PER_SECOND = 1000;

/**
 * Describe a run that exceeded its time budget, naming the budget.
 *
 * A bare "timed out" leaves the reader guessing whether the agent hung for
 * seconds or for an hour, and whether raising the limit would help.
 */
export function agentTimeoutMessage(timeoutMs: number): string {
  return `${AGENT_TIMEOUT_MESSAGE_PREFIX} after ${timeoutMs / MS_PER_SECOND}s`;
}
