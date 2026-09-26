/**
 * Cursor Executor Service
 *
 * Infrastructure implementation of IAgentExecutor for the Cursor agent.
 * Executes prompts via the `cursor-agent` CLI subprocess with JSON and stream-json
 * output formats.
 *
 * Uses constructor dependency injection for the spawn function
 * to enable testability without mocking node:child_process directly.
 */

import { writeFileSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AgentType, AgentFeature } from '../../../../../domain/generated/output.js';
import type {
  IAgentExecutor,
  AgentExecutionOptions,
  AgentExecutionResult,
  AgentExecutionStreamEvent,
} from '../../../../../application/ports/output/agents/agent-executor.interface.js';
import type { SpawnFunction } from '../types.js';
import { IS_WINDOWS } from '../../../../platform.js';
import { EventChannel } from '../../streaming/event-channel.js';
import { createExecutorLogger, type ExecutorLogger } from './executor-logger.js';
import { describeSubprocessFailure } from './subprocess-failure-message.js';
import { describeResultEventError, resultEventError } from './result-event-outcome.js';
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
import {
  CURSOR_AGENT_NAME as AGENT_NAME,
  CURSOR_BINARY,
  CURSOR_NOT_FOUND_MESSAGE,
  toCursorModelName,
} from './cursor-cli.js';

/**
 * stderr fragment Cursor prints when the requested model is unavailable.
 * Retrying cannot help, so the run is failed as soon as it appears.
 */
const UNUSABLE_MODEL_MARKER = 'Cannot use this model';

/** Features supported by Cursor CLI */
const SUPPORTED_FEATURES = new Set<string>(['session-resume', 'streaming']);

/** Cursor NDJSON event types. */
const EVENT_TYPE_ASSISTANT = 'assistant';
const EVENT_TYPE_RESULT = 'result';
const EVENT_TYPE_TOOL_CALL = 'tool_call';
const EVENT_TYPE_USER = 'user';
const EVENT_TYPE_ERROR = 'error';

/** Render a value that should have been text but may be a structured payload. */
function asText(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value === undefined || value === null) return '';
  return JSON.stringify(value);
}

/**
 * Quote a value as a PowerShell single-quoted literal.
 *
 * Inside single quotes PowerShell performs no expansion at all, and a literal
 * quote is written by doubling it. Without this, `--model` — a free-form
 * settings string — could close the invocation and start a command of its own.
 */
function psQuote(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

/** Text blocks of a Cursor assistant message, concatenated. */
function assistantText(parsed: Record<string, unknown>): string {
  const message = parsed.message as { content?: unknown } | undefined;
  if (!Array.isArray(message?.content)) return '';
  return message.content
    .filter((block: { type?: string; text?: unknown }) => block.type === 'text' && block.text)
    .map((block: { text?: unknown }) => asText(block.text))
    .join('');
}

/** Name of the tool a `tool_call` event refers to. */
function toolCallName(parsed: Record<string, unknown>, fallback: string): string {
  return (
    Object.keys(parsed).find((k) => k.endsWith('ToolCall') || k.endsWith('toolCall')) ?? fallback
  );
}

/**
 * Executor service for Cursor agent.
 * Uses subprocess spawning to interact with the `cursor-agent` CLI.
 */
export class CursorExecutorService implements IAgentExecutor {
  readonly agentType: AgentType = 'cursor' as AgentType;

  constructor(private readonly spawn: SpawnFunction) {}

  /** Executor capabilities for security constraint validation */
  private static readonly CAPABILITIES: ExecutorCapabilities = {
    requiresPermissiveMode: true, // uses --yolo (approves every tool call)
    executorName: 'cursor',
  };

  supportsFeature(feature: AgentFeature): boolean {
    return SUPPORTED_FEATURES.has(feature as string);
  }

  async execute(prompt: string, options?: AgentExecutionOptions): Promise<AgentExecutionResult> {
    const log = this.startRun(options);
    // Use json (not stream-json) for execute() — outputs a single JSON result line.
    const { proc, tmpFile } = this.spawnAgent(
      prompt,
      this.buildFlags(options, 'json'),
      options,
      log
    );

    return new Promise<AgentExecutionResult>((resolve, reject) => {
      const stderr = createStderrTail();
      let resultText = '';
      let rawText = '';
      let sessionId: string | undefined;
      let metadata: Record<string, unknown> | undefined;
      /** True once the CLI emitted its terminal `result` event. */
      let resultSeen = false;
      /** Error signal carried by the `result` event, if any. */
      let resultError: ReturnType<typeof resultEventError>;
      /** Set when the budget elapsed — the run's outcome, whatever follows. */
      let timeoutError: string | undefined;
      let settled = false;
      let timeoutId: ReturnType<typeof setTimeout> | undefined;
      let cancelEscalation: (() => void) | undefined;

      const settle = (outcome: () => void): void => {
        if (settled) return;
        settled = true;
        abortWatch.stop();
        if (timeoutId) clearTimeout(timeoutId);
        cancelEscalation?.();
        removeTempFile(tmpFile);
        outcome();
      };

      // No idle guard here, by design: `--output-format json` prints ONE line
      // when the whole turn is done, so silence is the normal shape of a
      // healthy run and `options.idleTimeout` would kill every run longer than
      // it. The total timeout bounds this path; executeStream() honours idle.
      const timeoutMs = options?.timeout;
      if (timeoutMs) {
        timeoutId = setTimeout(() => {
          timeoutError = agentTimeoutMessage(timeoutMs);
          log(`Timeout after ${timeoutMs}ms — terminating agent`);
          cancelEscalation = terminateWithEscalation(proc);
        }, timeoutMs);
      }
      // The caller's cancel: like a timeout, 'close' reports it, so awaiting
      // this call awaits the teardown.
      const abortWatch = watchAbortSignal(proc, options?.abortSignal, {
        onAbort: () => {
          timeoutError ??= AGENT_ABORTED_MESSAGE;
          log(`${AGENT_ABORTED_MESSAGE} — terminating agent`);
        },
        onUnreaped: () => settle(() => reject(new Error(AGENT_ABORTED_MESSAGE))),
      });

      const accumulator = createLineAccumulator(
        (line) => {
          this.logStreamEvent(line, log);
          const parsed = parseJsonLine(line);
          if (parsed === null) {
            // Non-JSON output — kept only as a fallback answer.
            rawText += `${line}\n`;
            return;
          }
          if (parsed.type === EVENT_TYPE_ASSISTANT) {
            resultText += assistantText(parsed);
          } else if (parsed.type === EVENT_TYPE_RESULT) {
            resultSeen = true;
            resultError = resultEventError(parsed);
            // json format puts the full result text in parsed.result
            if (typeof parsed.result === 'string' && parsed.result) resultText = parsed.result;
            if (typeof parsed.session_id === 'string') sessionId = parsed.session_id;
            if (parsed.duration_ms !== undefined) {
              metadata = { ...metadata, duration_ms: parsed.duration_ms };
            }
          }
        },
        {
          onOverflow: (dropped) => log(`[warn] discarded ${dropped} bytes of un-terminated output`),
        }
      );

      proc.stdout?.on('data', (chunk: Buffer | string) => accumulator.push(chunk));

      proc.stderr?.on('data', (chunk: Buffer | string) => {
        const data = chunk.toString();
        stderr.push(chunk);
        log(`stderr: ${data.trimEnd()}`);

        // Detect fatal errors early so callers don't waste time retrying
        if (data.includes(UNUSABLE_MODEL_MARKER)) {
          const detail = data.trim();
          cancelEscalation = terminateWithEscalation(proc);
          settle(() => reject(new Error(detail)));
        }
      });

      proc.on('error', (error: Error & { code?: string }) => {
        log(`Process error event: ${error.message}`);
        settle(() => reject(classifySpawnError(error, CURSOR_NOT_FOUND_MESSAGE)));
      });

      proc.on('close', (code: number | null, signal: NodeJS.Signals | null) => {
        accumulator.flush();
        // Use raw text as fallback when no JSON result was captured
        const finalText = resultText || rawText.trim();
        log(`Process closed with code ${code}, result=${finalText.length} chars`);

        settle(() => {
          if (timeoutError) {
            reject(new Error(timeoutError));
            return;
          }

          if (code !== 0 && code !== null) {
            // Cursor reports its own reason in the result text; stderr is
            // secondary detail, not the cause.
            reject(
              new Error(
                describeSubprocessFailure({ code, resultText: finalText, stderr: stderr.text() })
              )
            );
            return;
          }

          // A turn-limit or errored result exits 0 — its own error signal wins.
          if (resultError) {
            reject(
              new Error(describeResultEventError(AGENT_NAME, resultError, finalText, stderr.text()))
            );
            return;
          }

          // A signal kill (OOM killer, external kill) before the terminal
          // `result` event cut the turn short, however much text had arrived.
          if (code === null && !resultSeen) {
            reject(new Error(signalTerminationMessage(signal, stderr.text())));
            return;
          }

          const result: AgentExecutionResult = { result: finalText };
          if (sessionId) result.sessionId = sessionId;
          if (metadata) result.metadata = metadata;
          resolve(result);
        });
      });
    });
  }

  async *executeStream(
    prompt: string,
    options?: AgentExecutionOptions
  ): AsyncIterable<AgentExecutionStreamEvent> {
    const log = this.startRun(options);
    const { proc, tmpFile } = this.spawnAgent(
      prompt,
      this.buildFlags(options, 'stream-json'),
      options,
      log
    );

    const channel = new EventChannel<AgentExecutionStreamEvent>();
    const stderr = createStderrTail();
    /** Assistant text seen so far — the answer the `result` event announces. */
    let resultText = '';
    /** True once the CLI emitted its terminal `result` event (success or not). */
    let resultSeen = false;
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
      if (!resultSeen) expire(message);
    });
    // The caller's cancel ends the stream the way a timeout does.
    const abortWatch = watchAbortSignal(proc, options?.abortSignal, {
      onAbort: () => expire(AGENT_ABORTED_MESSAGE),
    });

    const accumulator = createLineAccumulator((line) => {
      const parsed = parseJsonLine(line);
      if (parsed === null) {
        channel.push({ type: 'progress', content: line, timestamp: new Date() });
        return;
      }

      if (parsed.type === EVENT_TYPE_ASSISTANT) {
        const text = assistantText(parsed);
        if (text) {
          resultText += text;
          channel.push({ type: 'progress', content: text, timestamp: new Date() });
        }
        return;
      }

      if (parsed.type === EVENT_TYPE_RESULT) {
        resultSeen = true;
        // The session id identifies the conversation; it is NOT the answer.
        // Returning it as `content` handed every downstream graph node a UUID.
        const content =
          typeof parsed.result === 'string' && parsed.result ? parsed.result : resultText;
        const failure = resultEventError(parsed);
        if (failure) {
          channel.push({
            type: 'error',
            content: describeResultEventError(AGENT_NAME, failure, content),
            timestamp: new Date(),
          });
          return;
        }
        const event: AgentExecutionStreamEvent = {
          type: 'result',
          content,
          timestamp: new Date(),
        };
        if (typeof parsed.session_id === 'string') event.sessionId = parsed.session_id;
        channel.push(event);
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
        content: classifySpawnError(error, CURSOR_NOT_FOUND_MESSAGE).message,
        timestamp: new Date(),
      });
      channel.close();
    });

    proc.on('close', (code: number | null, signal: NodeJS.Signals | null) => {
      processClosed = true;
      accumulator.flush();
      if (timeoutId) clearTimeout(timeoutId);

      if (code !== 0 && code !== null) {
        channel.push({
          type: 'error',
          content: describeSubprocessFailure({ code, resultText, stderr: stderr.text() }),
          timestamp: new Date(),
        });
      } else if (code === null && !resultSeen) {
        channel.push({
          type: 'error',
          content: signalTerminationMessage(signal, stderr.text()),
          timestamp: new Date(),
        });
      }
      channel.close();
    });

    try {
      yield* channel;
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
      abortWatch.stop();
      // A consumer that breaks out of the loop would otherwise leave the agent
      // running until it finished on its own.
      if (!processClosed) terminateWithEscalation(proc);
      removeTempFile(tmpFile);
    }
  }

  /** Validate policy and build the per-call logger shared by both entry points. */
  private startRun(options?: AgentExecutionOptions): ExecutorLogger {
    const log = createExecutorLogger(options?.silent);
    const warning = validateSecurityConstraints(
      options?.securityConstraints,
      CursorExecutorService.CAPABILITIES
    );
    if (warning) log(warning);
    return log;
  }

  /**
   * Log a stream-json line as a human-readable event in the worker log.
   */
  private logStreamEvent(line: string, log: ExecutorLogger): void {
    const parsed = parseJsonLine(line);
    if (parsed === null) {
      log(`[raw] ${line}`);
      return;
    }

    if (parsed.type === EVENT_TYPE_ASSISTANT) {
      const text = assistantText(parsed).trim();
      if (text) log(`[text] ${text.replace(/\n/g, ' ')}`);
      return;
    }

    if (parsed.type === EVENT_TYPE_TOOL_CALL) {
      log(`[tool] ${asText(parsed.subtype) || 'call'}: ${toolCallName(parsed, 'unknown')}`);
      return;
    }

    if (parsed.type === EVENT_TYPE_RESULT) {
      log(
        `[result] session=${asText(parsed.session_id) || 'none'}, duration=${
          asText(parsed.duration_ms) || 'unknown'
        }ms`
      );
    }
  }

  /**
   * Build the cursor-agent flags, WITHOUT the prompt.
   *
   * The prompt is appended as `-p <prompt>` on POSIX and delivered through a
   * temp file on Windows, so it never belongs in the shared flag list.
   */
  private buildFlags(options: AgentExecutionOptions | undefined, outputFormat: string): string[] {
    const flags = ['--yolo', '--output-format', outputFormat];
    if (options?.resumeSession) flags.push('--resume', options.resumeSession);
    if (options?.model) flags.push('--model', toCursorModelName(options.model));
    // Unsupported options silently omitted: systemPrompt, allowedTools, maxTurns, outputSchema
    // No auth flags — binary handles its own auth
    return flags;
  }

  /**
   * Spawn the agent process, handling Windows specially via PowerShell.
   *
   * On Windows, cursor CLI ships as `cursor-agent.cmd` which requires `shell: true`,
   * but cmd.exe mangles long `-p` arguments (8191-char limit + special chars).
   * Solution: write prompt to a temp file, invoke cursor-agent via PowerShell which
   * reads the file and passes the content as `-p`. PowerShell handles long
   * strings natively (32K limit) and doesn't mangle arguments.
   *
   * Every interpolated value is quoted with {@link psQuote}: PowerShell parses
   * the command string itself, so an unquoted flag value is executable text.
   *
   * On Linux/macOS, spawn `cursor-agent` directly — no shell needed.
   */
  private spawnAgent(
    prompt: string,
    flags: string[],
    options: AgentExecutionOptions | undefined,
    log: ExecutorLogger
  ): { proc: ReturnType<SpawnFunction>; tmpFile: string | undefined } {
    const spawnOpts = buildSpawnOptions({ cwd: options?.cwd });

    if (IS_WINDOWS) {
      // Write prompt to temp file to bypass cmd.exe argument mangling
      const tmpFile = join(
        tmpdir(),
        `shep-cursor-${Date.now()}-${Math.random().toString(36).slice(2, 6)}.txt`
      );
      writeFileSync(tmpFile, prompt, 'utf8');

      const psCmd = `$p = Get-Content -Raw ${psQuote(tmpFile)}; & ${CURSOR_BINARY} ${flags
        .map(psQuote)
        .join(' ')} -p $p`;

      log(`Windows PowerShell mode: wrote ${prompt.length} chars to ${tmpFile}`);
      log(`PS command: ${psCmd}`);

      const proc = this.spawn(
        'powershell.exe',
        ['-NoProfile', '-NonInteractive', '-Command', psCmd],
        spawnOpts
      );
      log(`PowerShell PID: ${proc.pid ?? 'undefined (spawn may have failed)'}`);
      if (proc.stdin) proc.stdin.end();

      return { proc, tmpFile };
    }

    // Linux/macOS: spawn agent directly with a plain argv array — no shell,
    // so no quoting question arises at all.
    const args = [...flags, '-p', prompt];
    log(
      `Spawning: ${CURSOR_BINARY} ${args.map((a) => (a.length > 80 ? `${a.slice(0, 77)}...` : a)).join(' ')}`
    );
    log(`Spawn cwd: ${(spawnOpts.cwd as string) ?? '(inherited)'}`);

    const proc = this.spawn(CURSOR_BINARY, args, spawnOpts);
    log(`Subprocess PID: ${proc.pid ?? 'undefined (spawn may have failed)'}`);
    if (proc.stdin) proc.stdin.end();

    return { proc, tmpFile: undefined };
  }
}

/** Remove the Windows prompt file; missing is the expected case. */
function removeTempFile(tmpFile: string | undefined): void {
  if (!tmpFile) return;
  try {
    unlinkSync(tmpFile);
  } catch {
    /* already removed or inaccessible */
  }
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

/** Map a non-assistant, non-result Cursor event to a stream event. */
function toStreamEvent(parsed: Record<string, unknown>): AgentExecutionStreamEvent | null {
  if (parsed.type === EVENT_TYPE_TOOL_CALL) {
    const name = toolCallName(parsed, 'tool');
    if (parsed.subtype === 'completed') {
      return { type: 'progress', content: `Tool completed: ${name}`, timestamp: new Date() };
    }
    if (parsed.subtype === 'started') {
      return { type: 'progress', content: `Tool started: ${name}`, timestamp: new Date() };
    }
    return null;
  }

  if (parsed.type === EVENT_TYPE_USER) return null; // Skip echoed input

  if (parsed.type === EVENT_TYPE_ERROR) {
    // Either field may carry a structured payload; `${object}` would render it
    // as "[object Object]" and throw away the only diagnostic there was.
    return {
      type: 'error',
      content: asText(parsed.error ?? parsed.message),
      timestamp: new Date(),
    };
  }

  return null;
}
