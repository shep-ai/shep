/**
 * Codex CLI Executor Service
 *
 * Infrastructure implementation of IAgentExecutor for the OpenAI Codex CLI agent.
 * Executes prompts via the `codex` CLI subprocess with JSONL output format.
 *
 * Uses constructor dependency injection for the spawn function
 * to enable testability without mocking node:child_process directly.
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type {
  AgentType,
  AgentFeature,
  AgentConfig,
} from '../../../../../domain/generated/output.js';
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
import { describeSubprocessFailure } from './subprocess-failure-message.js';
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

/** Binary name on PATH. */
const CODEX_BINARY = 'codex';

/** Shown when the binary is missing, so the user knows how to fix it. */
const CODEX_NOT_FOUND_MESSAGE =
  'Codex CLI ("codex") not found. Please install it: npm i -g @openai/codex';

/** Environment variable carrying the API key for token auth. */
const CODEX_API_KEY_ENV = 'CODEX_API_KEY';

/** Longest agent text logged verbatim before truncation. */
const LOG_PREVIEW_CHARS = 200;

/** Longest stderr summary carried into an error message. */
const STDERR_SUMMARY_CHARS = 300;

/** Number of stderr lines summarised in an error message. */
const STDERR_SUMMARY_LINES = 3;

/** Features supported by Codex CLI */
const SUPPORTED_FEATURES = new Set<string>([
  'session-resume',
  'streaming',
  'structured-output',
  'session-listing',
]);

/** Codex JSONL event types. */
const EVENT_TYPE_THREAD_STARTED = 'thread.started';
const EVENT_TYPE_ITEM_STARTED = 'item.started';
const EVENT_TYPE_ITEM_UPDATED = 'item.updated';
const EVENT_TYPE_ITEM_COMPLETED = 'item.completed';
const EVENT_TYPE_TURN_COMPLETED = 'turn.completed';
const EVENT_TYPE_TURN_FAILED = 'turn.failed';
const EVENT_TYPE_ERROR = 'error';

/** Codex item types. */
const ITEM_TYPE_COMMAND = 'command_execution';
const ITEM_TYPE_FILE_CHANGE = 'file_change';
const ITEM_TYPE_REASONING = 'reasoning';
const ITEM_TYPE_FUNCTION_CALL = 'function_call';
const ITEM_TYPE_FUNCTION_CALL_OUTPUT = 'function_call_output';

/**
 * Stderr patterns that explain why a run produced nothing.
 *
 * They are *diagnostic*, not fail-closed: the CLI also warns on stderr while
 * succeeding ("[warn] approaching rate limit"), and a plain `/rate.?limit/`
 * rejected completed runs over a warning. Exhaustion is matched, never the
 * attempt, and these are consulted only when there is no result to return.
 */
const DIAGNOSTIC_STDERR_PATTERNS = [
  /authentication.*failed/i,
  /rate.?limit.{0,20}(exceeded|reached)/i,
  /quota.*exceeded/i,
  /invalid.*api.?key/i,
  /RESOURCE_EXHAUSTED/i,
];

/** Item types that represent assistant text messages */
const MESSAGE_ITEM_TYPES = new Set(['agent_message', 'message']);

/** Render a value that should have been text but may be a structured payload. */
function asText(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value === undefined || value === null) return '';
  return JSON.stringify(value);
}

/** Parse one JSONL line, or null when the line is not JSON at all. */
function parseJsonLine(line: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(line);
    if (parsed === null || typeof parsed !== 'object') return null;
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** The `item` payload of a Codex event, if any. */
function itemOf(parsed: Record<string, unknown>): Record<string, unknown> | undefined {
  return parsed.item as Record<string, unknown> | undefined;
}

/** Shown when a `turn.failed` event carried no message of its own. */
const TURN_FAILED_FALLBACK = 'Turn failed';

/** The reason a `turn.failed` event gives, which may be nested under `error`. */
function turnFailedMessage(parsed: Record<string, unknown>): string {
  const error = parsed.error as { message?: unknown } | undefined;
  return asText(error?.message ?? parsed.message) || TURN_FAILED_FALLBACK;
}

/** True when the event describes an assistant text message. */
function isMessageItem(parsed: Record<string, unknown>): boolean {
  const type = itemOf(parsed)?.type;
  return typeof type === 'string' && MESSAGE_ITEM_TYPES.has(type);
}

/**
 * Executor service for OpenAI Codex CLI agent.
 * Uses subprocess spawning to interact with the `codex` CLI.
 */
export class CodexCliExecutorService implements IAgentExecutor {
  readonly agentType: AgentType = 'codex-cli' as AgentType;

  constructor(
    private readonly spawn: SpawnFunction,
    private readonly authConfig?: AgentConfig
  ) {}

  /** Executor capabilities for security constraint validation */
  private static readonly CAPABILITIES: ExecutorCapabilities = {
    requiresPermissiveMode: true, // uses --sandbox danger-full-access
    executorName: 'codex-cli',
  };

  supportsFeature(feature: AgentFeature): boolean {
    return SUPPORTED_FEATURES.has(feature as string);
  }

  async execute(prompt: string, options?: AgentExecutionOptions): Promise<AgentExecutionResult> {
    const log = this.startRun(options);

    let tempSchemaPath: string | undefined;
    try {
      tempSchemaPath = writeSchemaFile(options);
      const proc = this.spawnCodex(prompt, options, tempSchemaPath, log);

      return await new Promise<AgentExecutionResult>((resolve, reject) => {
        const stderr = createStderrTail();
        let resultText = '';
        let sessionId: string | undefined;
        let usage: AgentExecutionUsage | undefined;
        /** True once Codex emitted `turn.completed` — the turn's terminal event. */
        let turnCompleted = false;
        /** Reason Codex gave in `turn.failed`, if the turn failed. */
        let turnFailure: string | undefined;
        /** Set when the budget elapsed — the run's outcome, whatever follows. */
        let timeoutError: string | undefined;
        let settled = false;
        let timeoutId: ReturnType<typeof setTimeout> | undefined;
        let cancelEscalation: (() => void) | undefined;

        const settle = (outcome: () => void): void => {
          if (settled) return;
          settled = true;
          if (timeoutId) clearTimeout(timeoutId);
          cancelEscalation?.();
          outcome();
        };

        const timeoutMs = options?.timeout;
        if (timeoutMs) {
          timeoutId = setTimeout(() => {
            timeoutError = agentTimeoutMessage(timeoutMs);
            log(`Timeout after ${timeoutMs}ms — terminating agent`);
            cancelEscalation = terminateWithEscalation(proc);
          }, timeoutMs);
        }

        const accumulator = createLineAccumulator(
          (line) => {
            this.logStreamEvent(line, log);
            const parsed = parseJsonLine(line);
            if (!parsed) return; // Malformed JSON line — skip gracefully

            if (parsed.type === EVENT_TYPE_THREAD_STARTED && parsed.thread_id) {
              sessionId = asText(parsed.thread_id);
            } else if (parsed.type === EVENT_TYPE_ITEM_COMPLETED && isMessageItem(parsed)) {
              // Accumulate response text from completed agent messages
              const text = extractItemText(parsed);
              if (text) resultText += text;
            } else if (parsed.type === EVENT_TYPE_TURN_COMPLETED) {
              turnCompleted = true;
              if (parsed.usage) usage = extractUsage(parsed.usage as Record<string, number>);
            } else if (parsed.type === EVENT_TYPE_TURN_FAILED) {
              turnFailure = turnFailedMessage(parsed);
            }
          },
          {
            onOverflow: (dropped) =>
              log(`[warn] discarded ${dropped} bytes of un-terminated output`),
          }
        );

        proc.stdout?.on('data', (chunk: Buffer | string) => accumulator.push(chunk));

        proc.stderr?.on('data', (chunk: Buffer | string) => {
          stderr.push(chunk);
          log(`stderr: ${chunk.toString().trimEnd()}`);
        });

        proc.on('error', (error: Error & { code?: string }) => {
          log(`Process error event: ${error.message}`);
          settle(() => reject(classifySpawnError(error, CODEX_NOT_FOUND_MESSAGE)));
        });

        proc.on('close', (code: number | null, signal: NodeJS.Signals | null) => {
          accumulator.flush();
          log(`Process closed with code ${code}, result=${resultText.length} chars`);

          settle(() => {
            if (timeoutError) {
              reject(new Error(timeoutError));
              return;
            }

            if (code !== 0 && code !== null) {
              // The CLI names its own reason in the result text; stderr is
              // setup diagnostics that healthy runs emit too.
              reject(
                new Error(describeSubprocessFailure({ code, resultText, stderr: stderr.text() }))
              );
              return;
            }

            // Codex exits 0 after a failed turn; the text before it is a fragment.
            if (turnFailure) {
              reject(new Error(turnFailure));
              return;
            }

            // A signal kill (OOM killer, external kill) before `turn.completed`
            // cut the turn short, however much text had already arrived.
            if (code === null && !turnCompleted) {
              reject(new Error(signalTerminationMessage(signal, stderr.text())));
              return;
            }

            // A complete message IS the run's outcome. stderr noise from a
            // sub-request the CLI recovered from must not discard it.
            if (resultText) {
              const result: AgentExecutionResult = { result: resultText };
              if (sessionId) result.sessionId = sessionId;
              if (usage) result.usage = usage;
              resolve(result);
              return;
            }

            // No answer: stderr is the only diagnosis available.
            const diagnosis = diagnoseStderr(stderr.text());
            if (diagnosis) {
              reject(new Error(diagnosis));
              return;
            }

            if (!sessionId) {
              reject(
                new Error(
                  `Empty response from Codex CLI. stderr: ${stderr.text().slice(0, STDERR_SUMMARY_CHARS)}`
                )
              );
              return;
            }

            const result: AgentExecutionResult = { result: resultText, sessionId };
            if (usage) result.usage = usage;
            resolve(result);
          });
        });
      });
    } finally {
      removeSchemaFile(tempSchemaPath);
    }
  }

  async *executeStream(
    prompt: string,
    options?: AgentExecutionOptions
  ): AsyncIterable<AgentExecutionStreamEvent> {
    const log = this.startRun(options);

    let tempSchemaPath: string | undefined;
    try {
      tempSchemaPath = writeSchemaFile(options);
      const proc = this.spawnCodex(prompt, options, tempSchemaPath, log);

      const channel = new EventChannel<AgentExecutionStreamEvent>();
      const stderr = createStderrTail();
      let resultText = '';
      let sessionId: string | undefined;
      /** Text already emitted for the message item in flight. */
      let emittedText = '';
      /** True once Codex emitted `turn.completed` — the turn's terminal event. */
      let turnCompleted = false;
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
        this.logStreamEvent(line, log);
        const parsed = parseJsonLine(line);
        if (!parsed) {
          // Non-JSON line — emit as raw progress
          channel.push({ type: 'progress', content: line, timestamp: new Date() });
          return;
        }

        const type = parsed.type as string;
        const item = itemOf(parsed);
        const isMessage = isMessageItem(parsed);

        if (type === EVENT_TYPE_THREAD_STARTED) {
          if (parsed.thread_id) sessionId = asText(parsed.thread_id);
          return;
        }

        if (type === EVENT_TYPE_ITEM_STARTED && isMessage) {
          emittedText = '';
          channel.push({ type: 'progress', content: '', timestamp: new Date() });
          return;
        }

        if (type === EVENT_TYPE_ITEM_UPDATED && isMessage) {
          const text = extractDeltaText(parsed);
          if (text === undefined) return;
          // `item.text` is the message SO FAR, not the new fragment. Emitting
          // it whole made a live consumer render "HelHelloHello world".
          const delta = text.startsWith(emittedText) ? text.slice(emittedText.length) : text;
          emittedText = text;
          if (delta) channel.push({ type: 'progress', content: delta, timestamp: new Date() });
          return;
        }

        if (type === EVENT_TYPE_ITEM_COMPLETED && isMessage) {
          const text = extractItemText(parsed);
          if (text) resultText += text;
          emittedText = '';
          return;
        }

        if (type === EVENT_TYPE_ITEM_STARTED && item?.type === ITEM_TYPE_COMMAND) {
          const cmd = asText(item.command ?? item.name) || 'command';
          channel.push({ type: 'progress', content: `Running: ${cmd}`, timestamp: new Date() });
          return;
        }

        if (type === EVENT_TYPE_ITEM_COMPLETED && item?.type === ITEM_TYPE_COMMAND) {
          channel.push({
            type: 'progress',
            content: `Command completed (exit ${asText(item.exit_code)})`,
            timestamp: new Date(),
          });
          return;
        }

        if (type === EVENT_TYPE_ITEM_STARTED && item?.type === ITEM_TYPE_FILE_CHANGE) {
          channel.push({ type: 'progress', content: 'Modifying files', timestamp: new Date() });
          return;
        }

        if (type === EVENT_TYPE_ITEM_COMPLETED && item?.type === ITEM_TYPE_FILE_CHANGE) {
          const file = asText(item.file ?? item.path);
          channel.push({
            type: 'progress',
            content: file ? `Modified: ${file}` : 'File change completed',
            timestamp: new Date(),
          });
          return;
        }

        if (type === EVENT_TYPE_TURN_COMPLETED) {
          turnCompleted = true;
          const event: AgentExecutionStreamEvent = {
            type: 'result',
            content: resultText,
            timestamp: new Date(),
          };
          if (sessionId) event.sessionId = sessionId;
          channel.push(event);
          return;
        }

        if (type === EVENT_TYPE_TURN_FAILED) {
          channel.push({
            type: 'error',
            content: turnFailedMessage(parsed),
            timestamp: new Date(),
          });
          return;
        }

        if (type === EVENT_TYPE_ERROR) {
          // Either field may carry a structured payload; `${object}` would
          // render it as "[object Object]" and lose the only diagnostic.
          channel.push({
            type: 'error',
            content: asText(parsed.message ?? parsed.error) || 'Unknown error',
            timestamp: new Date(),
          });
        }

        // Unknown event type — skip gracefully
      });

      proc.stdout?.on('data', (chunk: Buffer | string) => accumulator.push(chunk));
      proc.stderr?.on('data', (chunk: Buffer | string) => stderr.push(chunk));

      proc.on('error', (error: Error & { code?: string }) => {
        processClosed = true;
        if (timeoutId) clearTimeout(timeoutId);
        channel.push({
          type: 'error',
          content: classifySpawnError(error, CODEX_NOT_FOUND_MESSAGE).message,
          timestamp: new Date(),
        });
        channel.close();
      });

      proc.on('close', (code: number | null, signal: NodeJS.Signals | null) => {
        processClosed = true;
        if (timeoutId) clearTimeout(timeoutId);
        if (timedOut) return; // already reported by the timeout callback

        accumulator.flush();

        if (code !== 0 && code !== null) {
          channel.push({
            type: 'error',
            content: describeSubprocessFailure({ code, resultText, stderr: stderr.text() }),
            timestamp: new Date(),
          });
        } else if (code === null && !turnCompleted) {
          // Same rule as execute(): a kill before `turn.completed` is a cut turn.
          channel.push({
            type: 'error',
            content: signalTerminationMessage(signal, stderr.text()),
            timestamp: new Date(),
          });
        } else if (!resultText) {
          // Same rule as execute(): stderr only gets to fail the run when the
          // agent produced nothing of its own.
          const diagnosis = diagnoseStderr(stderr.text());
          if (diagnosis) {
            channel.push({ type: 'error', content: diagnosis, timestamp: new Date() });
          }
        }
        channel.close();
      });

      try {
        yield* channel;
      } finally {
        if (timeoutId) clearTimeout(timeoutId);
        // A consumer that breaks out of the loop would otherwise leave the
        // agent running until it finished on its own.
        if (!processClosed) terminateWithEscalation(proc);
      }
    } finally {
      removeSchemaFile(tempSchemaPath);
    }
  }

  /** Validate policy and build the per-call logger shared by both entry points. */
  private startRun(options?: AgentExecutionOptions): ExecutorLogger {
    const log = createExecutorLogger(options?.silent);
    const warning = validateSecurityConstraints(
      options?.securityConstraints,
      CodexCliExecutorService.CAPABILITIES
    );
    if (warning) log(warning);
    return log;
  }

  private spawnCodex(
    prompt: string,
    options: AgentExecutionOptions | undefined,
    tempSchemaPath: string | undefined,
    log: ExecutorLogger
  ): ReturnType<SpawnFunction> {
    const args = this.buildArgs(prompt, options, tempSchemaPath);
    const spawnOpts = this.buildSpawnOptions();

    log(
      `Spawning: ${CODEX_BINARY} ${args.map((a) => (a.length > 80 ? `${a.slice(0, 77)}...` : a)).join(' ')}`
    );
    log(`Spawn cwd: ${(spawnOpts.cwd as string) ?? '(inherited)'}`);

    const proc = this.spawn(CODEX_BINARY, args, spawnOpts);
    log(`Subprocess PID: ${proc.pid ?? 'undefined (spawn may have failed)'}`);
    log(`Prompt length: ${prompt.length} chars (piped via stdin)`);
    // Log the actual prompt for debugging (truncate very long prompts)
    const promptPreview = prompt.length > 500 ? `${prompt.slice(0, 497)}...` : prompt;
    log(`[text] Prompt: ${promptPreview.replace(/\n/g, ' ')}`);

    // Codex accepts `-` for both initial and resumed prompts, so user input is
    // piped on every path and never reaches argv. The error handler matters:
    // the CLI exits early on a bad flag or an auth failure, and the resulting
    // EPIPE would otherwise take the whole worker down instead of failing this
    // run.
    writePromptToStdin(proc, prompt, (error) =>
      log(`stdin closed before the prompt was written (${error.code ?? error.message})`)
    );

    return proc;
  }

  /**
   * Log a JSONL stream line as a human-readable event in the worker log.
   * Extracts tool calls (function_call), assistant text, command executions,
   * and result summaries for verbose debugging.
   */
  private logStreamEvent(line: string, log: ExecutorLogger): void {
    const parsed = parseJsonLine(line);
    if (!parsed) {
      // Non-JSON line — log raw
      if (line.length > 0) log(`[raw] ${line}`);
      return;
    }

    const type = parsed.type as string;
    const item = itemOf(parsed);
    const itemType = item?.type as string | undefined;

    // Thread lifecycle
    if (type === EVENT_TYPE_THREAD_STARTED) {
      log(`[thread] started thread_id=${asText(parsed.thread_id) || 'unknown'}`);
      return;
    }

    // Agent/assistant message text — log the content
    if (type === EVENT_TYPE_ITEM_COMPLETED && isMessageItem(parsed)) {
      const text = extractItemText(parsed);
      if (text) log(`[text] ${preview(text)}`);
      return;
    }

    // Delta/partial updates for messages — log text fragments
    if (type === EVENT_TYPE_ITEM_UPDATED && isMessageItem(parsed)) {
      const delta = extractDeltaText(parsed);
      if (delta) log(`[delta] ${delta.replace(/\n/g, ' ')}`);
      return;
    }

    // Reasoning items — model's chain-of-thought
    if (type === EVENT_TYPE_ITEM_COMPLETED && itemType === ITEM_TYPE_REASONING) {
      const text = extractItemText(parsed);
      if (text) log(`[text] Reasoning: ${preview(text)}`);
      return;
    }

    // Function/tool calls — log name and arguments
    if (type === EVENT_TYPE_ITEM_STARTED && itemType === ITEM_TYPE_FUNCTION_CALL) {
      log(`[tool] ${asText(item?.name ?? item?.call_id) || 'unknown'} ${asText(item?.arguments)}`);
      return;
    }
    if (type === EVENT_TYPE_ITEM_COMPLETED && itemType === ITEM_TYPE_FUNCTION_CALL) {
      log(`[tool] ${asText(item?.name) || 'unknown'} completed`);
      return;
    }

    // Function call output — log truncated result
    if (type === EVENT_TYPE_ITEM_COMPLETED && itemType === ITEM_TYPE_FUNCTION_CALL_OUTPUT) {
      log(`[tool-result] ${preview(asText(item?.output))}`);
      return;
    }

    // Command executions (Codex shell tool)
    if (type === EVENT_TYPE_ITEM_STARTED && itemType === ITEM_TYPE_COMMAND) {
      log(`[cmd] running: ${asText(item?.command ?? item?.name) || 'command'}`);
      return;
    }
    if (type === EVENT_TYPE_ITEM_COMPLETED && itemType === ITEM_TYPE_COMMAND) {
      const output = preview(asText(item?.output));
      log(`[cmd] exit=${asText(item?.exit_code)}${output ? ` output: ${output}` : ''}`);
      return;
    }

    // File changes
    if (type === EVENT_TYPE_ITEM_STARTED && itemType === ITEM_TYPE_FILE_CHANGE) {
      log(`[file] modifying: ${asText(item?.file ?? item?.path)}`);
      return;
    }
    if (type === EVENT_TYPE_ITEM_COMPLETED && itemType === ITEM_TYPE_FILE_CHANGE) {
      log(`[file] modified: ${asText(item?.file ?? item?.path)}`);
      return;
    }

    // Turn lifecycle with usage stats
    if (type === EVENT_TYPE_TURN_COMPLETED) {
      const u = parsed.usage as Record<string, number> | undefined;
      if (u) log(`[tokens] ${u.input_tokens ?? 0} in / ${u.output_tokens ?? 0} out`);
      else log('[turn] completed');
      return;
    }

    if (type === EVENT_TYPE_TURN_FAILED) {
      const error = parsed.error as { message?: unknown } | undefined;
      log(`[turn] FAILED: ${asText(error?.message ?? parsed.message) || 'unknown'}`);
      return;
    }

    // Error events
    if (type === EVENT_TYPE_ERROR) {
      log(`[error] ${asText(parsed.message ?? parsed.error) || 'unknown'}`);
      return;
    }

    // Catch-all: log any unhandled event so nothing is silently dropped
    const summary = itemType ? `${type} (${itemType})` : type;
    log(`[event] ${summary}: ${preview(line)}`);
  }

  /**
   * Build CLI arguments for codex exec.
   *
   * For initial execution: `codex exec - --json --sandbox danger-full-access ...`
   * For resume: `codex exec resume <threadId> "prompt" --json --sandbox danger-full-access ...`
   */
  private buildArgs(
    _prompt: string,
    options?: AgentExecutionOptions,
    tempSchemaPath?: string
  ): string[] {
    const baseFlags = [
      '--json',
      '--sandbox',
      'danger-full-access',
      '--skip-git-repo-check',
      '--color',
      'never',
    ];

    if (options?.model) baseFlags.push('--model', options.model);
    if (options?.cwd) baseFlags.push('--cd', options.cwd);
    if (tempSchemaPath) baseFlags.push('--output-schema', tempSchemaPath);

    if (options?.resumeSession) {
      // Current Codex CLI treats `resume` as an exec subcommand, so exec-level
      // flags (--sandbox, --cd, --color) must appear BEFORE it. The trailing
      // `-` reads the resumed prompt from stdin, which also keeps user input
      // out of argv.
      return ['exec', ...baseFlags, 'resume', options.resumeSession, '-'];
    }

    // Initial execution: codex exec - [flags]
    // The `-` indicates prompt is piped via stdin
    return ['exec', '-', ...baseFlags];
  }

  /**
   * Spawn options for codex.
   *
   * The working directory is passed to the CLI with `--cd` rather than as the
   * child's cwd, so it is deliberately absent here.
   */
  private buildSpawnOptions(): Record<string, unknown> {
    const extraEnv: Record<string, string> = {};

    // Inject CODEX_API_KEY when using token auth
    if (this.authConfig?.authMethod === 'token' && this.authConfig.token) {
      extraEnv[CODEX_API_KEY_ENV] = this.authConfig.token;
    }

    return buildSpawnOptions({ extraEnv });
  }
}

/** Truncate long text for a log line. */
function preview(text: string): string {
  const flat = text.replace(/\n/g, ' ');
  return flat.length > LOG_PREVIEW_CHARS ? `${flat.slice(0, LOG_PREVIEW_CHARS - 3)}...` : flat;
}

/** Write the structured-output schema to a temp file, when one was requested. */
function writeSchemaFile(options?: AgentExecutionOptions): string | undefined {
  if (!options?.outputSchema) return undefined;
  const schemaPath = path.join(
    os.tmpdir(),
    `codex-schema-${Date.now()}-${Math.random().toString(36).slice(2)}.json`
  );
  fs.writeFileSync(schemaPath, JSON.stringify(options.outputSchema));
  return schemaPath;
}

/** Best-effort cleanup of the temp schema file. */
function removeSchemaFile(schemaPath: string | undefined): void {
  if (!schemaPath) return;
  try {
    fs.unlinkSync(schemaPath);
  } catch {
    // Best effort cleanup
  }
}

/**
 * Extract token usage from Codex CLI turn.completed usage object.
 */
function extractUsage(usageObj: Record<string, number>): AgentExecutionUsage | undefined {
  if (usageObj.input_tokens === undefined && usageObj.output_tokens === undefined) {
    return undefined;
  }
  return {
    inputTokens: usageObj.input_tokens ?? 0,
    outputTokens: usageObj.output_tokens ?? 0,
  };
}

/**
 * Extract the text of an item.updated event.
 * Codex CLI uses `item.text` (the message so far); other shapes use content
 * blocks or `item.delta`.
 */
function extractDeltaText(parsed: Record<string, unknown>): string | undefined {
  const item = itemOf(parsed);
  if (!item) return undefined;
  if (typeof item.text === 'string' && item.text) return item.text;

  const content = item.content;
  if (Array.isArray(content)) {
    for (const block of content as { type?: string; text?: string }[]) {
      if (block.type === 'text' && block.text) return block.text;
    }
  }
  if (typeof item.delta === 'string') return item.delta;
  return undefined;
}

/**
 * Extract final text from an item.completed event.
 * Codex CLI uses `item.text` directly, while other formats use `item.content` blocks.
 */
function extractItemText(parsed: Record<string, unknown>): string | undefined {
  const item = itemOf(parsed);
  if (!item) return undefined;
  if (typeof item.text === 'string' && item.text) return item.text;

  const content = item.content;
  if (Array.isArray(content)) {
    const parts: string[] = [];
    for (const block of content as { type?: string; text?: string }[]) {
      if (block.type === 'text' && block.text) parts.push(block.text);
    }
    return parts.length > 0 ? parts.join('') : undefined;
  }
  if (typeof content === 'string') return content;
  return undefined;
}

/**
 * Summarise stderr when it explains an empty run.
 * Returns null when stderr carries nothing recognisable.
 */
function diagnoseStderr(stderr: string): string | null {
  for (const pattern of DIAGNOSTIC_STDERR_PATTERNS) {
    if (pattern.test(stderr)) {
      const lines = stderr.split('\n').filter((l) => l.trim());
      const summary = lines
        .slice(0, STDERR_SUMMARY_LINES)
        .join(' | ')
        .slice(0, STDERR_SUMMARY_CHARS);
      return `Codex CLI exited without a result; stderr reports a fatal error: ${summary}`;
    }
  }
  return null;
}
