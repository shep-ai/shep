/**
 * Bedrock Integration Service Interface
 *
 * Output port for orchestrating the project-bedrock CLI lifecycle
 * (init, sync, ship, doctor) from shep use cases.
 *
 * The port is presentation-agnostic and infrastructure-agnostic:
 *   - No Node APIs (child_process, fs, stream) appear in any signature.
 *   - No web/CLI/TUI concepts leak across the boundary.
 *   - `onProgress` is a plain TypeScript function — never a Node EventEmitter or stream.
 *
 * Implementations live in `infrastructure/services/integrations/` and are
 * registered in the tsyringe container under the string token
 * 'IBedrockIntegrationService'.
 */

import type { BedrockHealth, BedrockLifecycleAction } from '../../../../domain/generated/output.js';

/**
 * A single chunk of streamed subprocess output.
 *
 * Emitted by long-running lifecycle calls (`init`, `sync`, `ship`) as the
 * bedrock subprocess writes to stdout/stderr. Plain TypeScript shape — never
 * a Node Buffer or stream object.
 */
export interface BedrockProgressChunk {
  /** Which subprocess stream the chunk came from. */
  stream: 'stdout' | 'stderr';
  /** Already-decoded UTF-8 string payload for this chunk. */
  data: string;
}

/**
 * Callback invoked once per output chunk while a lifecycle command is running.
 *
 * Presentation layers wire this to whatever destination is appropriate:
 *   - CLI pipes to `process.stdout` / `process.stderr`.
 *   - Web accumulates into `OperationLog` entries.
 *   - Tests pass a vitest spy.
 */
export type BedrockProgressHandler = (chunk: BedrockProgressChunk) => void;

/**
 * Options common to every lifecycle invocation.
 *
 * `cwd` is the absolute path of the worktree the bedrock subprocess must run
 * inside. It is resolved by the calling use case from
 * `Application.repositoryPath` (or the active worktree path) — the adapter
 * never derives it implicitly from `process.cwd()`.
 */
export interface BedrockLifecycleOptions {
  /** Absolute path to the worktree root where `bedrock` should execute. */
  cwd: string;
  /** Optional progress callback for streaming stdout/stderr chunks. */
  onProgress?: BedrockProgressHandler;
}

/**
 * Result of a single lifecycle invocation.
 *
 * `stdout` and `stderr` are the FULL captured output (post-stream) for
 * callers that did not consume `onProgress` chunks. `exitCode` is the
 * subprocess exit code (0 on success).
 */
export interface BedrockLifecycleResult {
  /** The lifecycle action that produced this result. */
  action: BedrockLifecycleAction;
  /** Captured stdout in full. */
  stdout: string;
  /** Captured stderr in full. */
  stderr: string;
  /** Subprocess exit code — 0 on success, non-zero on failure. */
  exitCode: number;
}

/**
 * Output port exposing the project-bedrock CLI lifecycle to use cases.
 *
 * Methods correspond 1:1 to bedrock's public subcommands. `doctor()` is
 * separate from the streaming-lifecycle trio because its return shape is
 * structurally different (per-tier health) and it never produces user-facing
 * progress output worth streaming.
 */
export interface IBedrockIntegrationService {
  /**
   * Bootstrap a bedrock-managed memory layout inside the given worktree.
   *
   * Equivalent to `bedrock init` invoked with `cwd = opts.cwd`. Streams
   * output through `opts.onProgress` when provided.
   */
  init(opts: BedrockLifecycleOptions): Promise<BedrockLifecycleResult>;

  /**
   * Reconcile bedrock memory with the local git state inside the given
   * worktree.
   *
   * Equivalent to `bedrock sync`. Streams output through `opts.onProgress`.
   */
  sync(opts: BedrockLifecycleOptions): Promise<BedrockLifecycleResult>;

  /**
   * Commit bedrock memory updates inside the given worktree.
   *
   * Equivalent to `bedrock ship`. Streams output through `opts.onProgress`.
   */
  ship(opts: BedrockLifecycleOptions): Promise<BedrockLifecycleResult>;

  /**
   * Run the three-tier prerequisite probe (Python ≥ 3.9, pipx, bedrock
   * binary) and return a typed aggregated health report.
   *
   * Never streams output — each tier is a short version probe that
   * completes well under the 2-second NFR-5 budget on a healthy machine.
   */
  doctor(): Promise<BedrockHealth>;
}
