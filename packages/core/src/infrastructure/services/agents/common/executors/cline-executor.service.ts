/**
 * Cline Executor Service
 *
 * Infrastructure implementation of IAgentExecutor for the Cline CLI agent.
 * Executes prompts via the `cline` CLI subprocess in headless mode with
 * JSON output for structured parsing.
 *
 * Cline is a multi-provider agentic coding assistant that runs a full
 * agentic loop with file system access, terminal execution, and tool use.
 * It supports multiple LLM backends (Anthropic, OpenRouter, Together AI,
 * Ollama, etc.) configured via `cline auth`.
 *
 * Uses constructor dependency injection for the spawn function
 * to enable testability without mocking node:child_process directly.
 */

import type { AgentType, AgentFeature } from '../../../../../domain/generated/output.js';
import type {
  IAgentExecutor,
  AgentExecutionOptions,
  AgentExecutionResult,
  AgentExecutionStreamEvent,
} from '../../../../../application/ports/output/agents/agent-executor.interface.js';
import type { SpawnFunction } from '../types.js';
import { EventChannel } from '../../streaming/event-channel.js';
import { createExecutorLogger, type ExecutorLogger } from './executor-logger.js';
import { describeSubprocessFailure } from './subprocess-failure-message.js';
import {
  agentTimeoutMessage,
  buildSpawnOptions,
  classifySpawnError,
  createLineAccumulator,
  createStderrTail,
  signalTerminationMessage,
  terminateWithEscalation,
  watchProcessIdle,
  AGENT_ABORTED_MESSAGE,
  watchAbortSignal,
} from './process-stream.js';
import {
  validateSecurityConstraints,
  type ExecutorCapabilities,
} from './security-constraint-validator.js';

/** Binary name on PATH. */
const CLINE_BINARY = 'cline';

/** Shown when the binary is missing, so the user knows how to fix it. */
const CLINE_NOT_FOUND_MESSAGE =
  'Cline CLI ("cline") not found. Please install it: npm install -g cline';

/** Milliseconds per second, for the CLI's seconds-based --timeout flag. */
const MS_PER_SECOND = 1000;

/** Longest agent text logged verbatim before truncation. */
const LOG_PREVIEW_CHARS = 200;

/** Features supported by Cline CLI */
const SUPPORTED_FEATURES = new Set<string>(['streaming', 'system-prompt']);

/** Cline event shape: `{ type: "say"|"ask"|"error", text, ts, partial }`. */
const EVENT_TYPE_SAY = 'say';
const EVENT_TYPE_ASK = 'ask';
const EVENT_TYPE_ERROR = 'error';

/** Render a value that should have been text but may be a structured payload. */
function asText(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value === undefined || value === null) return '';
  return JSON.stringify(value);
}

/**
 * Executor service for the Cline agentic coding assistant.
 * Uses subprocess spawning to interact with the `cline` CLI in headless mode.
 */
export class ClineExecutorService implements IAgentExecutor {
  readonly agentType: AgentType = 'cline' as AgentType;

  constructor(private readonly spawn: SpawnFunction) {}

  /** Executor capabilities for security constraint validation */
  private static readonly CAPABILITIES: ExecutorCapabilities = {
    requiresPermissiveMode: true, // uses -y (approves every tool call up front)
    executorName: 'cline',
  };

  supportsFeature(feature: AgentFeature): boolean {
    return SUPPORTED_FEATURES.has(feature as string);
  }

  async execute(prompt: string, options?: AgentExecutionOptions): Promise<AgentExecutionResult> {
    const log = this.startRun(options);
    const proc = this.spawnCline(prompt, options, log);

    return new Promise<AgentExecutionResult>((resolve, reject) => {
      const stderr = createStderrTail();
      /** Text carried by structured `say` events — the agent's actual answer. */
      let resultText = '';
      /** Anything the CLI printed that was not JSON (banners, warnings). */
      let rawText = '';
      /** Set when the budget elapsed — the run's outcome, whatever follows. */
      let timeoutError: string | undefined;
      let settled = false;
      let timeoutId: ReturnType<typeof setTimeout> | undefined;
      let cancelEscalation: (() => void) | undefined;

      /** Settle exactly once — a kill may or may not be followed by 'close'. */
      const settle = (outcome: () => void): void => {
        if (settled) return;
        settled = true;
        abortWatch.stop();
        if (timeoutId) clearTimeout(timeoutId);
        cancelEscalation?.();
        outcome();
      };

      /** Out of budget (total or idle): kill, and let 'close' report it. */
      const expire = (message: string): void => {
        if (timeoutError) return;
        timeoutError = message;
        log(`${message} — terminating agent`);
        cancelEscalation = terminateWithEscalation(proc);
      };

      const timeoutMs = options?.timeout;
      if (timeoutMs) {
        timeoutId = setTimeout(() => expire(agentTimeoutMessage(timeoutMs)), timeoutMs);
      }
      watchProcessIdle(proc, options?.idleTimeout, (message) => {
        expire(message);
      });
      // The caller's cancel: like a timeout, 'close' reports it, so awaiting
      // this call awaits the teardown.
      const abortWatch = watchAbortSignal(proc, options?.abortSignal, {
        onAbort: () => expire(AGENT_ABORTED_MESSAGE),
        onUnreaped: () => settle(() => reject(new Error(AGENT_ABORTED_MESSAGE))),
      });

      const accumulator = createLineAccumulator(
        (line) => {
          this.logStreamEvent(line, log);
          const parsed = parseJsonLine(line);
          if (parsed === null) {
            // CLI chatter, not the answer — kept only as a fallback.
            rawText += `${line}\n`;
            return;
          }
          if (
            parsed.type === EVENT_TYPE_SAY &&
            typeof parsed.text === 'string' &&
            !parsed.partial
          ) {
            resultText += parsed.text;
          }
        },
        {
          onOverflow: (dropped) => log(`[warn] discarded ${dropped} bytes of un-terminated output`),
        }
      );

      proc.stdout?.on('data', (chunk: Buffer | string) => accumulator.push(chunk));

      proc.stderr?.on('data', (chunk: Buffer | string) => {
        stderr.push(chunk);
        log(`stderr: ${chunk.toString().trimEnd()}`);
      });

      proc.on('error', (error: Error & { code?: string }) => {
        log(`Process error event: ${error.message}`);
        settle(() => reject(classifySpawnError(error, CLINE_NOT_FOUND_MESSAGE)));
      });

      proc.on('close', (code: number | null, signal: NodeJS.Signals | null) => {
        accumulator.flush();
        const finalText = resultText || rawText.trim();
        log(`Process closed with code ${code}, result=${finalText.length} chars`);

        settle(() => {
          if (timeoutError) {
            reject(new Error(timeoutError));
            return;
          }

          if (code !== 0 && code !== null) {
            // The CLI's own result text names the cause; stderr carries setup
            // diagnostics that healthy runs emit too.
            reject(
              new Error(
                describeSubprocessFailure({ code, resultText: finalText, stderr: stderr.text() })
              )
            );
            return;
          }

          // code === null means a signal killed the agent (OOM killer, an
          // external kill). Cline's output has no terminal event, so text that
          // arrived before the kill cannot be told apart from a finished turn —
          // a kill is always a failure, never a partial answer.
          if (code === null) {
            reject(new Error(signalTerminationMessage(signal, stderr.text())));
            return;
          }

          resolve({ result: finalText });
        });
      });
    });
  }

  async *executeStream(
    prompt: string,
    options?: AgentExecutionOptions
  ): AsyncIterable<AgentExecutionStreamEvent> {
    const log = this.startRun(options);
    const proc = this.spawnCline(prompt, options, log);

    const channel = new EventChannel<AgentExecutionStreamEvent>();
    const stderr = createStderrTail();
    /** Accumulated answer: emitted once, at close, never per event. */
    let resultText = '';
    let rawText = '';
    let processClosed = false;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    /** Set once a budget ran out; the kill's 'close' must not report again. */
    let expired = false;
    /** Out of budget (total or idle): kill and end the stream with the reason. */
    const expire = (message: string): void => {
      if (expired) return;
      expired = true;
      if (timeoutId) clearTimeout(timeoutId);
      log(`${message} — terminating agent`);
      terminateWithEscalation(proc);
      channel.push({ type: 'error', content: message, timestamp: new Date() });
      channel.close();
    };

    const timeoutMs = options?.timeout;
    if (timeoutMs) {
      timeoutId = setTimeout(() => expire(agentTimeoutMessage(timeoutMs)), timeoutMs);
    }
    watchProcessIdle(proc, options?.idleTimeout, (message) => {
      expire(message);
    });
    // The caller's cancel ends the stream the way a timeout does.
    const abortWatch = watchAbortSignal(proc, options?.abortSignal, {
      onAbort: () => expire(AGENT_ABORTED_MESSAGE),
    });

    const accumulator = createLineAccumulator((line) => {
      const parsed = parseJsonLine(line);
      if (parsed === null) {
        rawText += `${line}\n`;
        channel.push({ type: 'progress', content: line, timestamp: new Date() });
        return;
      }

      // A non-partial `say` is one chunk of the answer, not the answer itself.
      // Emitting each as a `result` let the last one ("[checkpoint saved]")
      // replace the real response for every consumer that keeps the last.
      if (parsed.type === EVENT_TYPE_SAY && typeof parsed.text === 'string' && !parsed.partial) {
        resultText += parsed.text;
        return;
      }

      const event = toStreamEvent(parsed);
      if (event) channel.push(event);
    });

    proc.stdout?.on('data', (chunk: Buffer | string) => accumulator.push(chunk));
    proc.stderr?.on('data', (chunk: Buffer | string) => stderr.push(chunk));

    proc.on('error', (error: Error & { code?: string }) => {
      processClosed = true;
      if (timeoutId) clearTimeout(timeoutId);
      channel.push({
        type: 'error',
        content: classifySpawnError(error, CLINE_NOT_FOUND_MESSAGE).message,
        timestamp: new Date(),
      });
      channel.close();
    });

    proc.on('close', (code: number | null, signal: NodeJS.Signals | null) => {
      processClosed = true;
      accumulator.flush();
      if (timeoutId) clearTimeout(timeoutId);

      const finalText = resultText || rawText.trim();

      if (code !== 0 && code !== null) {
        channel.push({
          type: 'error',
          content: describeSubprocessFailure({
            code,
            resultText: finalText,
            stderr: stderr.text(),
          }),
          timestamp: new Date(),
        });
      } else if (code === null) {
        // Same rule as execute(): no terminal event exists, so a kill is never a result.
        channel.push({
          type: 'error',
          content: signalTerminationMessage(signal, stderr.text()),
          timestamp: new Date(),
        });
      } else {
        channel.push({ type: 'result', content: finalText, timestamp: new Date() });
      }
      channel.close();
    });

    try {
      yield* channel;
    } finally {
      // A consumer that breaks out of the loop would otherwise leave the agent
      // running — holding a worktree, burning tokens — until it exits on its own.
      if (timeoutId) clearTimeout(timeoutId);
      abortWatch.stop();
      if (!processClosed) terminateWithEscalation(proc);
    }
  }

  /** Validate policy and build the per-call logger shared by both entry points. */
  private startRun(options?: AgentExecutionOptions): ExecutorLogger {
    const log = createExecutorLogger(options?.silent);
    const warning = validateSecurityConstraints(
      options?.securityConstraints,
      ClineExecutorService.CAPABILITIES
    );
    if (warning) log(warning);
    return log;
  }

  private spawnCline(
    prompt: string,
    options: AgentExecutionOptions | undefined,
    log: ExecutorLogger
  ): ReturnType<SpawnFunction> {
    const args = this.buildArgs(prompt, options);
    const spawnOpts = buildSpawnOptions({ cwd: options?.cwd });

    log(
      `Spawning: ${CLINE_BINARY} ${args.map((a) => (a.length > 80 ? `${a.slice(0, 77)}...` : a)).join(' ')}`
    );
    log(`Spawn cwd: ${(spawnOpts.cwd as string) ?? '(inherited)'}`);

    const proc = this.spawn(CLINE_BINARY, args, spawnOpts);
    log(`Subprocess PID: ${proc.pid ?? 'undefined (spawn may have failed)'}`);
    log(`Prompt length: ${prompt.length} chars`);
    return proc;
  }

  /**
   * Log a Cline JSON line as a human-readable event in the worker log.
   */
  private logStreamEvent(line: string, log: ExecutorLogger): void {
    const parsed = parseJsonLine(line);
    if (parsed === null) {
      log(`[raw] ${line}`);
      return;
    }
    if (parsed.type === EVENT_TYPE_SAY && typeof parsed.text === 'string') {
      const preview =
        parsed.text.length > LOG_PREVIEW_CHARS
          ? `${parsed.text.slice(0, LOG_PREVIEW_CHARS - 3)}...`
          : parsed.text;
      log(`[text] ${preview.replace(/\n/g, ' ')}`);
      return;
    }
    if (parsed.type === EVENT_TYPE_ASK) {
      log(`[ask] ${asText(parsed.text).slice(0, LOG_PREVIEW_CHARS).replace(/\n/g, ' ')}`);
    }
  }

  /**
   * Build CLI arguments for cline headless execution.
   *
   * Uses `-y` for fully autonomous execution (no approval prompts)
   * and `--json` for machine-readable newline-delimited JSON output.
   */
  private buildArgs(prompt: string, options?: AgentExecutionOptions): string[] {
    const args = ['-y', '--json'];

    if (options?.model) args.push('--model', options.model);
    if (options?.cwd) args.push('--cwd', options.cwd);
    if (options?.timeout)
      args.push('--timeout', String(Math.ceil(options.timeout / MS_PER_SECOND)));

    // The prompt is the last positional argument
    args.push(prompt);

    return args;
  }
}

/** One parsed Cline NDJSON event. */
interface ClineEvent {
  type?: string;
  text?: unknown;
  message?: unknown;
  partial?: boolean;
}

/** Parse one NDJSON line, or null when the line is not JSON at all. */
function parseJsonLine(line: string): ClineEvent | null {
  try {
    const parsed: unknown = JSON.parse(line);
    if (parsed === null || typeof parsed !== 'object') return null;
    return parsed as ClineEvent;
  } catch {
    return null;
  }
}

/** Map a parsed Cline event to a stream event, or null when it carries nothing. */
function toStreamEvent(parsed: ClineEvent): AgentExecutionStreamEvent | null {
  if (parsed.type === EVENT_TYPE_SAY && typeof parsed.text === 'string') {
    // Only partials reach here; complete `say` text is accumulated by the caller.
    return { type: 'progress', content: parsed.text, timestamp: new Date() };
  }

  if (parsed.type === EVENT_TYPE_ASK) {
    return { type: 'progress', content: asText(parsed.text), timestamp: new Date() };
  }

  if (parsed.type === EVENT_TYPE_ERROR) {
    // Either field may carry a structured payload; `${object}` would render it
    // as "[object Object]" and throw away the only diagnostic there was.
    const detail = parsed.text ?? parsed.message;
    return { type: 'error', content: asText(detail), timestamp: new Date() };
  }

  if (parsed.text !== undefined || parsed.message !== undefined) {
    return {
      type: 'progress',
      content: asText(parsed.text ?? parsed.message),
      timestamp: new Date(),
    };
  }

  return null;
}
