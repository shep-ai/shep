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

/**
 * Characters of a tool call's input written to the worker log.
 *
 * The log line exists to show WHICH tool ran and on what; a Write or Edit call
 * carries the whole file body, so logging it verbatim grew worker logs by
 * megabytes per run with content already in the worktree.
 */
export const MAX_TOOL_INPUT_LOG_CHARS = 2000;

/** Serialise a tool call's input for the worker log, capped at {@link MAX_TOOL_INPUT_LOG_CHARS}. */
export function toolInputLogPreview(input: unknown): string {
  const json = typeof input === 'string' ? input : JSON.stringify(input ?? {});
  if (json.length <= MAX_TOOL_INPUT_LOG_CHARS) return json;
  const omitted = json.length - MAX_TOOL_INPUT_LOG_CHARS;
  return `${json.slice(0, MAX_TOOL_INPUT_LOG_CHARS)}… (${omitted} more chars)`;
}

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
  return `${SIGNAL_TERMINATION_MESSAGE_PREFIX} ${cause} before producing a result.${
    detail ? ` ${detail}` : ''
  }`;
}

/**
 * Prefix of every {@link signalTerminationMessage}.
 *
 * Retry classification matches on it: a signal kill is the OOM killer, a
 * container stop or a user's Stop, and re-running the turn helps none of them.
 */
export const SIGNAL_TERMINATION_MESSAGE_PREFIX = 'Agent process was terminated by';

/**
 * Clause ending every "the turn ended without its terminal event" message.
 *
 * Retry classification matches on it: a cut stream is worth one re-run, since
 * the usual cause (a dropped pipe, an over-long line) does not repeat.
 */
export const TURN_CUT_SHORT_CLAUSE = 'the turn was cut short before it finished';

/**
 * Describe an agent CLI that exited cleanly without the event that ends a turn
 * (Claude/Copilot `result`, Codex `turn.completed`).
 *
 * Every CLI ends a turn with such an event — also when it gives up — so a
 * clean exit without one means stdout was cut short, and whatever text had
 * arrived is a fragment, not an answer.
 *
 * @param agentName - Human name of the agent CLI, e.g. "Codex CLI"
 * @param terminalEvent - The event type the CLI ends a turn with
 */
export function missingTerminalEventMessage(agentName: string, terminalEvent: string): string {
  return `${agentName} exited without a ${terminalEvent} event — ${TURN_CUT_SHORT_CLAUSE}`;
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

/**
 * Describe a run that went silent for its whole idle budget.
 *
 * Shares {@link AGENT_TIMEOUT_MESSAGE_PREFIX} so every timeout — total or
 * idle — is recognised (and not retried) by the same check.
 */
export function agentIdleTimeoutMessage(idleTimeoutMs: number): string {
  return `${AGENT_TIMEOUT_MESSAGE_PREFIX}: no output for ${idleTimeoutMs / MS_PER_SECOND}s`;
}

/**
 * True when `error` is an agent timeout — total or idle, from any executor,
 * including an AI SDK executor that prefixes its provider name.
 */
export function isAgentTimeoutError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes(AGENT_TIMEOUT_MESSAGE_PREFIX);
}

/**
 * Error every executor reports for a run its caller aborted
 * (`AgentExecutionOptions.abortSignal`). Retry classification treats it as
 * final: the caller asked the agent to stop, so re-running it would defy that.
 */
export const AGENT_ABORTED_MESSAGE = 'Agent execution aborted by its caller';

/**
 * How long an aborted run waits for its process to close before giving up on
 * it: the SIGTERM grace, the SIGKILL, and as long again for the OS to reap it.
 * Only a process stuck in uninterruptible I/O is still open by then.
 */
const ABORT_REAP_BACKSTOP_MS = 2 * SIGKILL_GRACE_MS;

/** A live subscription to an abort signal, from {@link watchAbortSignal}. */
export interface AbortWatch {
  /** True once the signal fired and the agent was told to terminate. */
  readonly aborted: boolean;
  /** Stop listening and cancel any pending escalation. Idempotent. */
  stop(): void;
}

/** What an executor does when its caller aborts. */
export interface AbortHandlers {
  /** Runs once the termination was issued (log it; a stream may report it). */
  onAbort?: () => void;
  /**
   * Runs if the process has still not closed {@link ABORT_REAP_BACKSTOP_MS}
   * after the abort, so a caller never waits forever on an unreapable process.
   */
  onUnreaped?: () => void;
}

/**
 * Terminate `proc` — tree kill, SIGKILL escalation — when `signal` aborts,
 * including a signal that was already aborted before the call.
 *
 * The one implementation of `AgentExecutionOptions.abortSignal` for every
 * subprocess executor. It deliberately does not settle the run: `execute()`
 * rejects with {@link AGENT_ABORTED_MESSAGE} from its `close` handler, so a
 * caller awaiting it has awaited the agent's teardown, not just the request
 * for it. The watch disarms itself (and cancels the escalation, whose pid may
 * be reused) when the process closes or fails to spawn.
 */
export function watchAbortSignal(
  proc: ChildProcess,
  signal: AbortSignal | undefined,
  handlers: AbortHandlers = {},
  killOptions?: KillOptions
): AbortWatch {
  let aborted = false;
  let stopped = false;
  let cancelEscalation: (() => void) | undefined;
  let backstop: ReturnType<typeof setTimeout> | undefined;

  const stop = (): void => {
    if (stopped) return;
    stopped = true;
    signal?.removeEventListener('abort', onAbortSignal);
    if (backstop) clearTimeout(backstop);
    cancelEscalation?.();
  };

  function onAbortSignal(): void {
    if (stopped || aborted) return;
    aborted = true;
    cancelEscalation = terminateWithEscalation(proc, killOptions);
    handlers.onAbort?.();
    backstop = setTimeout(() => handlers.onUnreaped?.(), ABORT_REAP_BACKSTOP_MS);
    backstop.unref?.();
  }

  if (signal) {
    proc.once('close', stop);
    proc.once('error', stop);
    if (signal.aborted) onAbortSignal();
    else signal.addEventListener('abort', onAbortSignal, { once: true });
  }

  return {
    get aborted() {
      return aborted;
    },
    stop,
  };
}

/** A timer that fires only after a stretch with no activity. */
export interface IdleWatchdog {
  /** Record activity (any stdout/stderr chunk), restarting the idle budget. */
  touch(): void;
  /** Disarm for good. Idempotent. */
  stop(): void;
}

/**
 * Call `onIdle` once, when `idleTimeoutMs` pass without a {@link IdleWatchdog.touch}.
 *
 * With no budget (`undefined`/0) the watchdog is inert, so an executor can
 * wire it unconditionally and let the caller opt in. The timer is `unref`'d:
 * the guard must never keep a worker alive on its own.
 */
export function createIdleWatchdog(
  idleTimeoutMs: number | undefined,
  onIdle: () => void
): IdleWatchdog {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let stopped = !idleTimeoutMs;

  const arm = (): void => {
    if (stopped) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      stopped = true;
      onIdle();
    }, idleTimeoutMs);
    timer.unref?.();
  };

  arm();
  return {
    touch: arm,
    stop(): void {
      stopped = true;
      if (timer) clearTimeout(timer);
    },
  };
}

/**
 * Arm the opt-in no-output guard on a spawned agent.
 *
 * Every stdout or stderr chunk restarts the budget, and the guard disarms
 * itself when the process closes or fails to spawn, so an executor only has to
 * say what "idle" does to its run. `onIdle` receives the
 * {@link agentIdleTimeoutMessage} to report; it should return without acting
 * once the CLI's terminal event has arrived — output after it is teardown,
 * which the executor's own shutdown handling already bounds.
 *
 * @param idleTimeoutMs - `AgentExecutionOptions.idleTimeout`; unset disables it
 */
export function watchProcessIdle(
  proc: Pick<ChildProcess, 'stdout' | 'stderr' | 'once'>,
  idleTimeoutMs: number | undefined,
  onIdle: (message: string) => void
): IdleWatchdog {
  if (!idleTimeoutMs) return createIdleWatchdog(undefined, () => undefined);

  const watchdog = createIdleWatchdog(idleTimeoutMs, () =>
    onIdle(agentIdleTimeoutMessage(idleTimeoutMs))
  );
  const touch = (): void => watchdog.touch();
  proc.stdout?.on('data', touch);
  proc.stderr?.on('data', touch);
  proc.once('close', () => watchdog.stop());
  proc.once('error', () => watchdog.stop());
  return watchdog;
}
