/**
 * Claude Code Executor Service
 *
 * Infrastructure implementation of IAgentExecutor for Claude Code agent.
 * Executes prompts via the `claude` CLI subprocess with JSON and stream-json
 * output formats.
 *
 * Uses constructor dependency injection for the spawn function
 * to enable testability without mocking node:child_process directly.
 */

import type { AgentType, AgentFeature } from '../../../../../domain/generated/output.js';
import type {
  IAgentExecutor,
  AgentExecutionOptions,
  AgentExecutionResult,
  AgentExecutionUsage,
  AgentExecutionStreamEvent,
} from '../../../../../application/ports/output/agents/agent-executor.interface.js';
import type { SpawnFunction } from '../types.js';
import { EventChannel } from '../../streaming/event-channel.js';
import { createExecutorLogger, type ExecutorLogger } from './executor-logger.js';
import {
  agentTimeoutMessage,
  buildSpawnOptions,
  classifySpawnError,
  createLineAccumulator,
  createStderrTail,
  signalTerminationMessage,
  terminateWithEscalation,
  writePromptToStdin,
} from './process-stream.js';
import {
  validateSecurityConstraints,
  type ExecutorCapabilities,
} from './security-constraint-validator.js';
import { describeSubprocessFailure } from './subprocess-failure-message.js';
import { describeResultEventError, resultEventError } from './result-event-outcome.js';

/** Binary name on PATH. */
const CLAUDE_BINARY = 'claude';

/** Shown when the binary is missing, so the user knows how to fix it. */
const CLAUDE_NOT_FOUND_MESSAGE =
  'Claude Code CLI ("claude") not found. Please install it: https://docs.anthropic.com/en/docs/agents-and-tools/claude-code/overview';

/** Features supported by Claude Code CLI */
const SUPPORTED_FEATURES = new Set<string>([
  'session-resume',
  'streaming',
  'system-prompt',
  'structured-output',
  'session-listing',
]);

/**
 * Maximum time to wait for the `claude` subprocess to exit on its own
 * after it has emitted its final `result` event. The CLI is supposed to
 * tear down its MCP servers and exit, but in practice it can hang
 * indefinitely if MCP children (e.g. Playwright) or background bash tools
 * (e.g. `pnpm dev:web`) keep stdio open. After this grace period we send
 * SIGKILL so the close handler fires and execute() resolves with the
 * captured result instead of leaving the worker stuck for hours.
 */
const RESULT_TO_CLOSE_GRACE_MS = 30_000;

/** Agent name used in failure messages. */
const AGENT_NAME = 'Claude Code';

/**
 * The Claude CLI ends every turn with a `result` event — also when it gives up
 * (see {@link resultEventError}). A clean exit without one means the output
 * was cut short (e.g. a line dropped for exceeding the line cap), so the turn
 * cannot be reported as finished, however much text arrived before it.
 */
const MISSING_RESULT_EVENT_MESSAGE = `${AGENT_NAME} exited without a result event — its output was cut short before the turn finished`;

/** Claude Code stream-json event types. */
const EVENT_TYPE_STREAM_EVENT = 'stream_event';
const EVENT_TYPE_ASSISTANT = 'assistant';
const EVENT_TYPE_RESULT = 'result';
const EVENT_TYPE_ERROR = 'error';

/** Render a value that should have been text but may be a structured payload. */
function asText(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value === undefined || value === null) return '';
  return JSON.stringify(value);
}

/** Parse one NDJSON line, or null when the line is not JSON at all. */
function parseJsonLine(line: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(line);
    if (parsed === null || typeof parsed !== 'object') return null;
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

/**
 * Executor service for Claude Code agent.
 * Uses subprocess spawning to interact with the `claude` CLI.
 */
export class ClaudeCodeExecutorService implements IAgentExecutor {
  readonly agentType: AgentType = 'claude-code' as AgentType;

  constructor(private readonly spawn: SpawnFunction) {}

  /** Executor capabilities for security constraint validation */
  private static readonly CAPABILITIES: ExecutorCapabilities = {
    requiresPermissiveMode: true, // uses --dangerously-skip-permissions
    executorName: 'claude-code',
  };

  supportsFeature(feature: AgentFeature): boolean {
    return SUPPORTED_FEATURES.has(feature as string);
  }

  async execute(prompt: string, options?: AgentExecutionOptions): Promise<AgentExecutionResult> {
    const log = this.startRun(options);
    const proc = this.spawnClaude(prompt, options, log);

    return new Promise<AgentExecutionResult>((resolve, reject) => {
      const stderr = createStderrTail();
      let settled = false;
      let timeoutId: ReturnType<typeof setTimeout> | undefined;
      let postResultKillTimer: ReturnType<typeof setTimeout> | undefined;
      let cancelEscalation: (() => void) | undefined;

      // Collected from the stream — only the final result line matters
      /** True once the CLI emitted its terminal `result` event. */
      let resultSeen = false;
      let resultText = '';
      let sessionId: string | undefined;
      let usage: AgentExecutionUsage | undefined;
      let metadata: Record<string, unknown> | undefined;
      // Error signal carried by the final `result` event, if any.
      let resultError: ReturnType<typeof resultEventError>;

      /**
       * Settle exactly once and drop every timer.
       *
       * The post-result grace timer used to survive the error path, so a run
       * that failed still signalled a pid this executor no longer owned.
       */
      const settle = (outcome: () => void): void => {
        if (settled) return;
        settled = true;
        if (timeoutId) clearTimeout(timeoutId);
        if (postResultKillTimer) clearTimeout(postResultKillTimer);
        cancelEscalation?.();
        outcome();
      };

      /** Resolve with whatever the result event carried. */
      const resolveCaptured = (): void => {
        const result: AgentExecutionResult = { result: resultText };
        if (sessionId) result.sessionId = sessionId;
        if (usage) result.usage = usage;
        if (metadata) result.metadata = metadata;
        resolve(result);
      };

      const timeoutMs = options?.timeout;
      if (timeoutMs) {
        timeoutId = setTimeout(() => {
          log(`Timeout after ${timeoutMs}ms — terminating agent`);
          cancelEscalation = terminateWithEscalation(proc);
          // Settle now rather than waiting for a 'close' a wedged child may
          // never emit. If the agent already produced its answer and only the
          // teardown hung, that answer is the run's outcome — discarding it
          // threw away completed work.
          settle(() => {
            if (resultSeen && !resultError) {
              log('Timed out after the result arrived — returning the captured result');
              resolveCaptured();
              return;
            }
            reject(new Error(agentTimeoutMessage(timeoutMs)));
          });
        }, timeoutMs);
      }

      const accumulator = createLineAccumulator(
        (line) => {
          this.logStreamEvent(line, log);
          const parsed = parseJsonLine(line);
          if (parsed?.type !== EVENT_TYPE_RESULT) return;

          resultSeen = true;
          resultText = asText(parsed.result);
          if (typeof parsed.session_id === 'string') sessionId = parsed.session_id;
          usage = extractUsage(parsed);
          resultError = resultEventError(parsed);

          const { type: _t, result: _r, session_id: _s, usage: _u, ...rest } = parsed;
          if (Object.keys(rest).length > 0) metadata = rest;

          // The CLI emitted its final result. Give it a grace period to tear
          // down MCP servers and exit on its own; if it still hasn't closed,
          // kill it so the close handler runs and we resolve. Without this,
          // leaked MCP/background children (issue: feature 92701aa8 hung 3+
          // hours after [result]) trap the worker forever.
          postResultKillTimer ??= setTimeout(() => {
            log(
              `Subprocess did not exit within ${RESULT_TO_CLOSE_GRACE_MS / 1000}s of [result] — terminating`
            );
            cancelEscalation = terminateWithEscalation(proc);
          }, RESULT_TO_CLOSE_GRACE_MS);
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
        settle(() => reject(classifySpawnError(error, CLAUDE_NOT_FOUND_MESSAGE)));
      });

      proc.on('close', (code: number | null, signal: NodeJS.Signals | null) => {
        accumulator.flush();
        log(`Process closed with code ${code}, result=${resultText.length} chars`);

        settle(() => {
          if (code !== 0 && code !== null) {
            // The CLI reports WHY it failed in its final result text; stderr
            // carries setup diagnostics that healthy runs emit too, so leading
            // with stderr names the wrong cause.
            reject(
              new Error(describeSubprocessFailure({ code, resultText, stderr: stderr.text() }))
            );
            return;
          }

          // The CLI exits 0 even when it gives up (turn limit, internal error).
          // Trust the result event's own error signal over the exit code.
          if (resultError) {
            reject(
              new Error(
                describeResultEventError(AGENT_NAME, resultError, resultText, stderr.text())
              )
            );
            return;
          }

          // code === null means a signal killed the agent (OOM killer, an
          // external kill, our own post-result teardown). Before the result
          // event that is a failure, however much text had streamed.
          if (code === null && !resultSeen) {
            reject(new Error(signalTerminationMessage(signal, stderr.text())));
            return;
          }

          if (!resultSeen) {
            reject(new Error(MISSING_RESULT_EVENT_MESSAGE));
            return;
          }

          resolveCaptured();
        });
      });
    });
  }

  async *executeStream(
    prompt: string,
    options?: AgentExecutionOptions
  ): AsyncIterable<AgentExecutionStreamEvent> {
    const log = this.startRun(options);
    const proc = this.spawnClaude(prompt, options, log);

    const channel = new EventChannel<AgentExecutionStreamEvent>();
    const stderr = createStderrTail();
    /** True once the CLI emitted its terminal `result` event (success or not). */
    let resultSeen = false;
    let processClosed = false;
    let timedOut = false;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    const timeoutMs = options?.timeout;
    if (timeoutMs) {
      timeoutId = setTimeout(() => {
        timedOut = true;
        log(`Timeout after ${timeoutMs}ms — terminating agent`);
        terminateWithEscalation(proc);
        channel.push({
          type: 'error',
          content: agentTimeoutMessage(timeoutMs),
          timestamp: new Date(),
        });
        channel.close();
      }, timeoutMs);
    }

    const accumulator = createLineAccumulator((line) => {
      const parsed = parseJsonLine(line);
      if (parsed?.type === EVENT_TYPE_RESULT) resultSeen = true;
      const event = parseStreamLine(line, parsed);
      if (event) channel.push(event);
    });

    proc.stdout?.on('data', (chunk: Buffer | string) => accumulator.push(chunk));
    proc.stderr?.on('data', (chunk: Buffer | string) => stderr.push(chunk));

    proc.on('error', (error: Error & { code?: string }) => {
      processClosed = true;
      if (timeoutId) clearTimeout(timeoutId);
      channel.push({
        type: 'error',
        content: classifySpawnError(error, CLAUDE_NOT_FOUND_MESSAGE).message,
        timestamp: new Date(),
      });
      channel.close();
    });

    proc.on('close', (code: number | null, signal: NodeJS.Signals | null) => {
      processClosed = true;
      if (timeoutId) clearTimeout(timeoutId);
      if (timedOut) return; // already reported by the timeout callback

      accumulator.flush();

      // Same outcome rule as execute(): a non-zero exit always fails, a signal
      // or a clean exit before the terminal `result` event means the turn was
      // cut short.
      if (code !== 0 && code !== null) {
        channel.push({
          type: 'error',
          content: describeSubprocessFailure({ code, stderr: stderr.text() }),
          timestamp: new Date(),
        });
      } else if (!resultSeen) {
        channel.push({
          type: 'error',
          content:
            code === null
              ? signalTerminationMessage(signal, stderr.text())
              : MISSING_RESULT_EVENT_MESSAGE,
          timestamp: new Date(),
        });
      }
      channel.close();
    });

    try {
      yield* channel;
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
      // A consumer that breaks out of the loop would otherwise leave the agent
      // running — holding a worktree, burning tokens — until it exits on its own.
      if (!processClosed) terminateWithEscalation(proc);
    }
  }

  /** Validate policy and build the per-call logger shared by both entry points. */
  private startRun(options?: AgentExecutionOptions): ExecutorLogger {
    const log = createExecutorLogger(options?.silent);
    const warning = validateSecurityConstraints(
      options?.securityConstraints,
      ClaudeCodeExecutorService.CAPABILITIES
    );
    if (warning) log(warning);
    return log;
  }

  private spawnClaude(
    prompt: string,
    options: AgentExecutionOptions | undefined,
    log: ExecutorLogger
  ): ReturnType<SpawnFunction> {
    // Use stream-json so we get real-time events in the worker log
    // instead of zero output for minutes with --output-format json
    const args = this.buildStreamArgs(options);
    const spawnOpts = buildSpawnOptions({ cwd: options?.cwd });

    log(
      `Spawning: ${CLAUDE_BINARY} ${args.map((a) => (a.length > 80 ? `${a.slice(0, 77)}...` : a)).join(' ')}`
    );
    log(`Spawn cwd: ${(spawnOpts.cwd as string) ?? '(inherited)'}`);

    const proc = this.spawn(CLAUDE_BINARY, args, spawnOpts);

    log(`Subprocess PID: ${proc.pid ?? 'undefined (spawn may have failed)'}`);
    log(`Prompt length: ${prompt.length} chars (piped via stdin)`);

    // Pipe the prompt via stdin to avoid ENAMETOOLONG on Windows. The error
    // handler matters: the CLI exits early on a bad flag or an auth failure,
    // and the resulting EPIPE would otherwise take the whole worker down.
    writePromptToStdin(proc, prompt, (error) =>
      log(`stdin closed before the prompt was written (${error.code ?? error.message})`)
    );

    return proc;
  }

  /**
   * Log a stream-json line as a human-readable event in the worker log.
   * Extracts tool calls, assistant text, and result summaries.
   */
  private logStreamEvent(line: string, log: ExecutorLogger): void {
    const parsed = parseJsonLine(line);
    if (!parsed) {
      // Non-JSON line — log it raw
      if (line.length > 0) log(`[raw] ${line}`);
      return;
    }

    // Assistant messages contain tool_use and text blocks
    const message = parsed.message as { content?: unknown } | undefined;
    if (parsed.type === EVENT_TYPE_ASSISTANT && Array.isArray(message?.content)) {
      for (const block of message.content as {
        type?: string;
        name?: string;
        input?: unknown;
        text?: string;
      }[]) {
        if (block.type === 'tool_use') {
          log(`[tool] ${block.name} ${JSON.stringify(block.input ?? {})}`);
        } else if (block.type === 'text' && block.text?.trim()) {
          log(`[text] ${block.text.trim().replace(/\n/g, ' ')}`);
        }
      }
      return;
    }

    // Final result — summary with session and token info
    if (parsed.type === EVENT_TYPE_RESULT) {
      log(
        `[result] ${asText(parsed.result).length} chars, session=${asText(parsed.session_id) || 'none'}`
      );
      const u = parsed.usage as Record<string, number> | undefined;
      if (u) {
        const inTokens =
          (u.input_tokens ?? 0) +
          (u.cache_creation_input_tokens ?? 0) +
          (u.cache_read_input_tokens ?? 0);
        const costStr =
          parsed.total_cost_usd != null ? `, $${Number(parsed.total_cost_usd).toFixed(4)}` : '';
        log(`[tokens] ${inTokens} in / ${u.output_tokens ?? 0} out${costStr}`);
      }
    }
  }

  private buildArgs(options?: AgentExecutionOptions): string[] {
    // Prompt is piped via stdin — not passed as a CLI argument — to avoid
    // ENAMETOOLONG on Windows when prompts exceed the ~32 KB arg-length limit.
    const args = ['-p', '--output-format', 'json', '--dangerously-skip-permissions'];
    if (options?.resumeSession) args.push('--resume', options.resumeSession);
    if (options?.model) args.push('--model', options.model);
    if (options?.systemPrompt) args.push('--append-system-prompt', options.systemPrompt);
    if (options?.allowedTools?.length) args.push('--allowedTools', options.allowedTools.join(','));
    if (options?.outputSchema) args.push('--json-schema', JSON.stringify(options.outputSchema));
    if (options?.maxTurns) args.push('--max-turns', String(options.maxTurns));
    if (options?.disableMcp) args.push('--strict-mcp-config');
    if (options?.mcpConfigPath) args.push('--mcp-config', options.mcpConfigPath);
    if (options?.tools?.length) args.push('--tools', options.tools.join(','));
    return args;
  }

  private buildStreamArgs(options?: AgentExecutionOptions): string[] {
    const args = this.buildArgs(options);
    const fmtIdx = args.indexOf('--output-format');
    if (fmtIdx !== -1) args[fmtIdx + 1] = 'stream-json';
    // stream-json with -p (--print) requires --verbose so the CLI emits
    // per-message events. --include-partial-messages adds per-token deltas
    // on top — only opt in when the caller will consume them (interactive
    // streaming UX). For batch workers it's pure stdout bloat (~10× more
    // lines that are JSON-parsed and discarded).
    args.push('--verbose');
    if (options?.streamProgress) args.push('--include-partial-messages');
    args.push('--no-chrome');
    return args;
  }
}

/**
 * Extract token usage and execution stats from a Claude Code CLI result object.
 * Tokens live inside `parsed.usage`; cost/turns/apiDuration at the top level.
 */
function extractUsage(parsed: Record<string, unknown>): AgentExecutionUsage | undefined {
  const u = parsed.usage as Record<string, number> | undefined;
  if (u?.output_tokens === undefined) return undefined;

  const cacheCreation = u.cache_creation_input_tokens ?? 0;
  const cacheRead = u.cache_read_input_tokens ?? 0;
  const inputTokens = (u.input_tokens ?? 0) + cacheCreation + cacheRead;

  const usage: AgentExecutionUsage = { inputTokens, outputTokens: u.output_tokens };

  if (cacheCreation > 0) usage.cacheCreationInputTokens = cacheCreation;
  if (cacheRead > 0) usage.cacheReadInputTokens = cacheRead;

  // Top-level fields from the result object
  if (typeof parsed.total_cost_usd === 'number') usage.costUsd = parsed.total_cost_usd;
  if (typeof parsed.num_turns === 'number') usage.numTurns = parsed.num_turns;
  if (typeof parsed.duration_api_ms === 'number') usage.durationApiMs = parsed.duration_api_ms;

  return usage;
}

/**
 * Map one stream-json line to a stream event, or null when it carries nothing.
 *
 * @param parsed - The line already parsed by {@link parseJsonLine}
 */
function parseStreamLine(
  line: string,
  parsed: Record<string, unknown> | null
): AgentExecutionStreamEvent | null {
  if (!parsed) {
    // Non-JSON line, treat as progress text
    return { type: 'progress', content: line, timestamp: new Date() };
  }

  // Handle Claude Code stream_json format with nested events
  if (parsed.type === EVENT_TYPE_STREAM_EVENT && parsed.event) {
    const event = parsed.event as { type?: string; delta?: { text?: string } };

    // Extract text deltas for progress
    if (event.type === 'content_block_delta' && event.delta?.text) {
      return { type: 'progress', content: event.delta.text, timestamp: new Date() };
    }

    // Message complete - ignore for now (accumulated text is in progress events)
    if (event.type === 'message_stop') return null;
  }

  // Ignore assistant messages - we already get all text via content_block_delta events
  if (parsed.type === EVENT_TYPE_ASSISTANT) return null;

  if (parsed.type === EVENT_TYPE_RESULT) {
    const content = asText(parsed.result);
    // A turn-limit or errored result is the CLI giving up, not an answer —
    // reported as an error so no consumer can take the fragment as finished.
    const failure = resultEventError(parsed);
    if (failure) {
      return {
        type: 'error',
        content: describeResultEventError(AGENT_NAME, failure, content),
        timestamp: new Date(),
      };
    }
    const event: AgentExecutionStreamEvent = { type: 'result', content, timestamp: new Date() };
    if (typeof parsed.session_id === 'string') event.sessionId = parsed.session_id;
    return event;
  }

  if (parsed.type === EVENT_TYPE_ERROR) {
    return {
      type: 'error',
      content: asText(parsed.error ?? parsed.message),
      timestamp: new Date(),
    };
  }

  // Generic progress for other event types (ensure content is a string)
  if (parsed.content || parsed.message) {
    return {
      type: 'progress',
      content: asText(parsed.content ?? parsed.message),
      timestamp: new Date(),
    };
  }

  return null;
}
