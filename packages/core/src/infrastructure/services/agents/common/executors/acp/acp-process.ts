/**
 * ACP Agent Process
 *
 * Owns the child process behind an ACP session: its stdio as the byte streams
 * `ndJsonStream` needs, and the single, first-wins account of why it died.
 *
 * The input stream ends when the process CLOSES, not when stdout ends. Node
 * emits stdout `end` before `close`, so ending on `end` would let the ACP
 * connection reject its pending requests with a generic "connection closed"
 * before the exit code and stderr were known. Ending on `close` guarantees
 * {@link AcpAgentProcess.deathError} is set by the time anything fails.
 */

import type { ChildProcess } from 'node:child_process';
import { ndJsonStream, type Stream } from '@agentclientprotocol/sdk';
import type { SpawnFunction } from '../../types.js';
import {
  buildSpawnOptions,
  classifySpawnError,
  createStderrTail,
  signalTerminationMessage,
  SIGKILL_GRACE_MS,
  terminateWithEscalation,
} from '../process-stream.js';

/** How long {@link AcpAgentProcess.waitForExit} waits: the SIGTERM grace, then the SIGKILL reap. */
const EXIT_REAP_BACKSTOP_MS = 2 * SIGKILL_GRACE_MS;

/** Inputs to {@link AcpAgentProcess.start}. */
export interface AcpProcessLaunch {
  spawn: SpawnFunction;
  command: string;
  args: string[];
  cwd: string;
  agentName: string;
  notFoundMessage: string;
}

export class AcpAgentProcess {
  /** The ACP transport over this process's stdio. */
  readonly stream: Stream;
  /** Resolves once the process is gone (exit or spawn failure). */
  readonly exited: Promise<void>;

  private death: Error | null = null;
  private readonly deathListeners: ((error: Error) => void)[] = [];
  private inputController: ReadableStreamDefaultController<Uint8Array> | null = null;
  private cancelEscalation: (() => void) | undefined;

  private constructor(
    private readonly proc: ChildProcess,
    launch: AcpProcessLaunch
  ) {
    const stderr = createStderrTail();
    proc.stderr?.on('data', (chunk: Buffer | string) => stderr.push(chunk));
    // A write racing the agent's exit raises EPIPE on stdin; without a
    // listener that reaches uncaughtException. The exit handler reports why.
    proc.stdin?.on('error', () => undefined);

    this.exited = new Promise<void>((resolve) => {
      proc.once('error', (error: Error & { code?: string }) => {
        this.die(classifySpawnError(error, launch.notFoundMessage));
        resolve();
      });
      proc.once('close', (code: number | null, signal: NodeJS.Signals | null) => {
        this.cancelEscalation?.();
        this.die(new Error(describeExit(launch.agentName, code, signal, stderr.text())));
        resolve();
      });
    });

    const input = new ReadableStream<Uint8Array>({
      start: (controller) => {
        this.inputController = controller;
        proc.stdout?.on('data', (chunk: Buffer) => {
          // Output after the process is gone has nowhere to go; enqueueing on
          // a closed stream would throw inside this listener.
          if (!this.death) controller.enqueue(new Uint8Array(chunk));
        });
      },
    });
    const output = new WritableStream<Uint8Array>({
      write: (chunk) =>
        new Promise<void>((resolve, reject) => {
          if (!proc.stdin || proc.stdin.destroyed) {
            reject(this.death ?? new Error(`${launch.agentName} stdin is closed`));
            return;
          }
          proc.stdin.write(chunk, (error) => (error ? reject(error) : resolve()));
        }),
    });
    this.stream = ndJsonStream(output, input);
  }

  /** Spawn the agent in `cwd` with no shell and the standard agent env. */
  static start(launch: AcpProcessLaunch): AcpAgentProcess {
    const proc = launch.spawn(launch.command, launch.args, buildSpawnOptions({ cwd: launch.cwd }));
    return new AcpAgentProcess(proc, launch);
  }

  /** Why the process is gone, or null while it runs. */
  get deathError(): Error | null {
    return this.death;
  }

  /** Called once, with the reason, when the process dies. */
  onDeath(listener: (error: Error) => void): void {
    this.deathListeners.push(listener);
  }

  /**
   * Resolve once the process has exited, or after the reap backstop — only a
   * process stuck in uninterruptible I/O outlives SIGKILL that long.
   */
  async waitForExit(): Promise<void> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const backstop = new Promise<void>((resolve) => {
      timer = setTimeout(resolve, EXIT_REAP_BACKSTOP_MS);
      timer.unref?.();
    });
    await Promise.race([this.exited, backstop]);
    clearTimeout(timer);
  }

  /** Kill the process tree (SIGKILL after the grace period). Idempotent. */
  terminate(): void {
    if (this.death || this.cancelEscalation) return;
    this.cancelEscalation = terminateWithEscalation(this.proc);
  }

  private die(error: Error): void {
    if (this.death) return;
    this.death = error;
    try {
      this.inputController?.close();
    } catch {
      // Already closed by the reader.
    }
    for (const listener of this.deathListeners) listener(error);
  }
}

/** Human account of how the agent process ended, with its last stderr. */
function describeExit(
  agentName: string,
  code: number | null,
  signal: NodeJS.Signals | null,
  stderrText: string
): string {
  if (code === null) return signalTerminationMessage(signal, stderrText);
  const detail = stderrText.trim();
  return `${agentName} exited with code ${code}${detail ? `: ${detail}` : ''}`;
}
