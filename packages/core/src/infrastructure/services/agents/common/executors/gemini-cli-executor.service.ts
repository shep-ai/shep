/**
 * Gemini CLI Executor Service
 *
 * Infrastructure implementation of IAgentExecutor for the Gemini CLI agent.
 * Executes prompts via the `gemini` CLI subprocess with JSON output format.
 *
 * Uses constructor dependency injection for the spawn function
 * to enable testability without mocking node:child_process directly.
 */

import type {
  AgentType,
  AgentFeature,
  AgentConfig,
} from '../../../../../domain/generated/output.js';
import type {
  IAgentExecutor,
  AgentExecutionOptions,
  AgentExecutionResult,
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
  watchProcessIdle,
  writePromptToStdin,
  AGENT_ABORTED_MESSAGE,
  watchAbortSignal,
} from './process-stream.js';
import {
  validateSecurityConstraints,
  type ExecutorCapabilities,
} from './security-constraint-validator.js';

/** Binary name on PATH. */
const GEMINI_BINARY = 'gemini';

/** Shown when the binary is missing, so the user knows how to fix it. */
const GEMINI_NOT_FOUND_MESSAGE =
  'Gemini CLI ("gemini") not found. Please install it: https://github.com/google-gemini/gemini-cli';

/** Environment variable carrying the API key for token auth. */
const GEMINI_API_KEY_ENV = 'GEMINI_API_KEY';

/**
 * Recent gemini-cli versions exit (code 55) in headless mode when the cwd is
 * not on the user's trusted-folders list, even with -y — the trust check
 * overrides YOLO. shep always runs gemini against worktrees it just created.
 */
const GEMINI_TRUST_WORKSPACE_ENV = 'GEMINI_CLI_TRUST_WORKSPACE';

/** Longest stderr summary carried into an error message. */
const STDERR_SUMMARY_CHARS = 300;

/** Number of stderr lines summarised in an error message. */
const STDERR_SUMMARY_LINES = 3;

/** Features supported by Gemini CLI */
const SUPPORTED_FEATURES = new Set<string>(['session-resume', 'streaming', 'tool-scoping']);

/** Gemini stream-json event types. */
const EVENT_TYPE_INIT = 'init';
const EVENT_TYPE_MESSAGE = 'message';
const EVENT_TYPE_TOOL_USE = 'tool_use';
const EVENT_TYPE_TOOL_RESULT = 'tool_result';
const EVENT_TYPE_RESULT = 'result';
const EVENT_TYPE_ERROR = 'error';

/** Render a value that should have been text but may be a structured payload. */
function asText(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value === undefined || value === null) return '';
  return JSON.stringify(value);
}

/**
 * Executor service for Gemini CLI agent.
 * Uses subprocess spawning to interact with the `gemini` CLI.
 */
export class GeminiCliExecutorService implements IAgentExecutor {
  readonly agentType: AgentType = 'gemini-cli' as AgentType;

  constructor(
    private readonly spawn: SpawnFunction,
    private readonly authConfig?: AgentConfig
  ) {}

  /** Executor capabilities for security constraint validation */
  private static readonly CAPABILITIES: ExecutorCapabilities = {
    requiresPermissiveMode: true, // uses -y (YOLO: approves every tool call)
    executorName: 'gemini-cli',
  };

  supportsFeature(feature: AgentFeature): boolean {
    return SUPPORTED_FEATURES.has(feature as string);
  }

  async execute(prompt: string, options?: AgentExecutionOptions): Promise<AgentExecutionResult> {
    const log = this.startRun(options);
    const proc = this.spawnGemini(prompt, options, 'json', log);

    return new Promise<AgentExecutionResult>((resolve, reject) => {
      const stderr = createStderrTail();
      const stdoutLines: string[] = [];
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

      // A single JSON document, read through the decoder so a multi-byte
      // character straddling two reads is reassembled rather than corrupted.
      // JSON never contains a raw newline inside a string, so rejoining the
      // lines reproduces the document exactly as far as a parser cares.
      const accumulator = createLineAccumulator((line) => stdoutLines.push(line), {
        onOverflow: (dropped) => log(`[warn] discarded ${dropped} bytes of un-terminated output`),
      });

      proc.stdout?.on('data', (chunk: Buffer | string) => accumulator.push(chunk));

      proc.stderr?.on('data', (chunk: Buffer | string) => {
        stderr.push(chunk);
        log(`stderr: ${chunk.toString().trimEnd()}`);
      });

      proc.on('error', (error: Error & { code?: string }) => {
        log(`Process error event: ${error.message}`);
        settle(() => reject(classifySpawnError(error, GEMINI_NOT_FOUND_MESSAGE)));
      });

      proc.on('close', (code: number | null, signal: NodeJS.Signals | null) => {
        accumulator.flush();
        const stdout = stdoutLines.join('\n');
        log(`Process closed with code ${code}, stdout=${stdout.length} chars`);

        settle(() => {
          if (timeoutError) {
            reject(new Error(timeoutError));
            return;
          }

          if (code !== 0 && code !== null) {
            const detail = stderr.text().trim();
            reject(
              new Error(
                detail
                  ? `Process exited with code ${code}: ${detail}`
                  : `Process exited with code ${code}`
              )
            );
            return;
          }

          const parsed = parseJsonDocument(stdout);
          const response = typeof parsed?.response === 'string' ? parsed.response : '';

          // A complete answer IS the run's outcome. stderr noise about an API
          // call the CLI retried (or recovered from) must not discard work the
          // agent already finished — that is how successful runs were lost.
          if (parsed && response) {
            const result: AgentExecutionResult = { result: response };
            if (typeof parsed.session_id === 'string') result.sessionId = parsed.session_id;
            const usage = extractUsage(parsed);
            if (usage) result.usage = usage;
            resolve(result);
            return;
          }

          // No answer: now stderr is the only diagnosis available.
          const diagnosis = diagnoseStderr(stderr.text());
          if (diagnosis) {
            reject(new Error(diagnosis));
            return;
          }

          if (code === null) {
            reject(new Error(signalTerminationMessage(signal, stderr.text())));
            return;
          }

          if (!parsed) {
            reject(
              new Error(
                `Failed to parse Gemini JSON output: ${stdout.slice(0, STDERR_SUMMARY_CHARS)}`
              )
            );
            return;
          }

          const result: AgentExecutionResult = { result: response };
          if (typeof parsed.session_id === 'string') result.sessionId = parsed.session_id;
          const usage = extractUsage(parsed);
          if (usage) result.usage = usage;
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
    const proc = this.spawnGemini(prompt, options, 'stream-json', log);

    const channel = new EventChannel<AgentExecutionStreamEvent>();
    const stderr = createStderrTail();
    let sawResult = false;
    let processClosed = false;
    let timedOut = false;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    /** Out of budget (total or idle): kill and end the stream with the reason. */
    const expire = (message: string): void => {
      if (timedOut) return;
      timedOut = true;
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
      if (!sawResult) expire(message);
    });
    // The caller's cancel ends the stream the way a timeout does.
    const abortWatch = watchAbortSignal(proc, options?.abortSignal, {
      onAbort: () => expire(AGENT_ABORTED_MESSAGE),
    });

    const accumulator = createLineAccumulator((line) => {
      const event = parseStreamEvent(line);
      if (!event) return;
      if (event.type === 'result') sawResult = true;
      channel.push(event);
    });

    proc.stdout?.on('data', (chunk: Buffer | string) => accumulator.push(chunk));
    proc.stderr?.on('data', (chunk: Buffer | string) => stderr.push(chunk));

    proc.on('error', (error: Error & { code?: string }) => {
      processClosed = true;
      if (timeoutId) clearTimeout(timeoutId);
      channel.push({
        type: 'error',
        content: classifySpawnError(error, GEMINI_NOT_FOUND_MESSAGE).message,
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
        const detail = stderr.text().trim();
        channel.push({
          type: 'error',
          content: detail
            ? `Process exited with code ${code}: ${detail}`
            : `Process exited with code ${code}`,
          timestamp: new Date(),
        });
      } else if (!sawResult) {
        // Same rule as execute(): stderr only gets to fail the run when the
        // agent produced no result of its own.
        const diagnosis = diagnoseStderr(stderr.text());
        if (diagnosis) {
          channel.push({ type: 'error', content: diagnosis, timestamp: new Date() });
        } else if (code === null) {
          channel.push({
            type: 'error',
            content: signalTerminationMessage(signal, stderr.text()),
            timestamp: new Date(),
          });
        }
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
    }
  }

  /** Validate policy and build the per-call logger shared by both entry points. */
  private startRun(options?: AgentExecutionOptions): ExecutorLogger {
    const log = createExecutorLogger(options?.silent);
    const warning = validateSecurityConstraints(
      options?.securityConstraints,
      GeminiCliExecutorService.CAPABILITIES
    );
    if (warning) log(warning);
    return log;
  }

  private spawnGemini(
    prompt: string,
    options: AgentExecutionOptions | undefined,
    outputFormat: string,
    log: ExecutorLogger
  ): ReturnType<SpawnFunction> {
    const args = this.buildArgs(options, outputFormat, log);
    const spawnOpts = this.buildSpawnOptions(options);

    log(
      `Spawning: ${GEMINI_BINARY} ${args.map((a) => (a.length > 80 ? `${a.slice(0, 77)}...` : a)).join(' ')}`
    );
    log(`Spawn cwd: ${(spawnOpts.cwd as string) ?? '(inherited)'}`);

    const proc = this.spawn(GEMINI_BINARY, args, spawnOpts);
    log(`Subprocess PID: ${proc.pid ?? 'undefined (spawn may have failed)'}`);
    log(`Prompt length: ${prompt.length} chars (piped via stdin)`);

    // Pipe the prompt via stdin to avoid ENAMETOOLONG on Windows. The error
    // handler matters: a CLI that rejects its flags exits before reading, and
    // the resulting EPIPE would otherwise take the whole worker down.
    writePromptToStdin(proc, prompt, (error) =>
      log(`stdin closed before the prompt was written (${error.code ?? error.message})`)
    );

    return proc;
  }

  private buildArgs(
    options: AgentExecutionOptions | undefined,
    outputFormat: string,
    log: ExecutorLogger
  ): string[] {
    // Prompt is piped via stdin — not passed as a CLI argument — to avoid
    // ENAMETOOLONG on Windows when prompts exceed the ~32 KB arg-length limit.
    // -p requires a value (yargs won't accept it as a bare flag), so pass an
    // empty string; the actual prompt arrives via stdin and is used as-is.
    const args = ['-p', '', '--output-format', outputFormat, '-y'];

    if (options?.resumeSession) args.push('--resume', options.resumeSession);
    if (options?.model) args.push('-m', options.model);
    if (options?.allowedTools?.length) args.push('--allowed-tools', options.allowedTools.join(','));

    // Unsupported options silently omitted: maxTurns, disableMcp
    if (options?.systemPrompt) {
      log('systemPrompt option is not supported by Gemini CLI — ignoring');
    }
    if (options?.outputSchema) {
      log('outputSchema option is not supported by Gemini CLI — ignoring');
    }

    return args;
  }

  private buildSpawnOptions(options?: AgentExecutionOptions): Record<string, unknown> {
    const extraEnv: Record<string, string> = { [GEMINI_TRUST_WORKSPACE_ENV]: 'true' };

    // Inject GEMINI_API_KEY when using token auth
    if (this.authConfig?.authMethod === 'token' && this.authConfig.token) {
      extraEnv[GEMINI_API_KEY_ENV] = this.authConfig.token;
    }

    return buildSpawnOptions({ cwd: options?.cwd, extraEnv });
  }
}

/** Parse a whole JSON document, or null when it is not valid JSON. */
function parseJsonDocument(text: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(text);
    if (parsed === null || typeof parsed !== 'object') return null;
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

/**
 * Parse a single stream-JSON line into an AgentExecutionStreamEvent.
 * Returns null for events that should be skipped (init, user messages, unknown types).
 */
function parseStreamEvent(line: string): AgentExecutionStreamEvent | null {
  const parsed = parseJsonDocument(line);
  if (!parsed) {
    // Non-JSON line — emit as raw progress
    return { type: 'progress', content: line, timestamp: new Date() };
  }

  switch (parsed.type as string) {
    case EVENT_TYPE_INIT:
      return null;
    case EVENT_TYPE_MESSAGE:
      if (parsed.role === 'user') return null;
      if (parsed.role === 'assistant' && parsed.delta) {
        return { type: 'progress', content: asText(parsed.content), timestamp: new Date() };
      }
      return null;
    case EVENT_TYPE_TOOL_USE:
      return {
        type: 'progress',
        content: `[tool_use: ${asText(parsed.tool_name)}]`,
        timestamp: new Date(),
      };
    case EVENT_TYPE_TOOL_RESULT:
      return {
        type: 'progress',
        content: `[tool_result: ${asText(parsed.status)}]`,
        timestamp: new Date(),
      };
    case EVENT_TYPE_RESULT:
      return { type: 'result', content: asText(parsed.response), timestamp: new Date() };
    case EVENT_TYPE_ERROR:
      // Gemini puts the detail in `error` on some paths and `message` on
      // others; reading only one produced an error event with empty content.
      return {
        type: 'error',
        content: asText(parsed.message ?? parsed.error),
        timestamp: new Date(),
      };
    default:
      return null;
  }
}

/**
 * Patterns in stderr that explain why a run produced nothing.
 *
 * These are *diagnostic*, not fail-closed: "Attempt N failed with status 429.
 * Retrying" is printed when the CLI retries, and a retry that then succeeds
 * exits 0 with a full response. Applying these to a run that produced an answer
 * rejected completed work, so they are consulted only when there is no answer.
 */
const DIAGNOSTIC_STDERR_PATTERNS = [
  /RESOURCE_EXHAUSTED/i,
  /quota.*exceeded/i,
  /failed with status \d{3}/i,
];

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
      return `Gemini CLI exited without a result; stderr reports a fatal error: ${summary}`;
    }
  }
  return null;
}

/**
 * Extract token usage from Gemini stats structure.
 * Returns undefined if stats are missing (does not throw).
 */
function extractUsage(
  parsed: Record<string, unknown>
): { inputTokens: number; outputTokens: number } | undefined {
  const stats = parsed.stats as Record<string, unknown> | undefined;
  if (!stats?.models) return undefined;

  const models = stats.models as Record<string, Record<string, unknown>>;
  const firstModel = Object.values(models)[0];
  if (!firstModel?.tokens) return undefined;

  const tokens = firstModel.tokens as Record<string, number>;
  if (tokens.prompt === undefined || tokens.candidates === undefined) return undefined;

  return { inputTokens: tokens.prompt, outputTokens: tokens.candidates };
}
