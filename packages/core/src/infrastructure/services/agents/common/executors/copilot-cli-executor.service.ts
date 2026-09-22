/**
 * Copilot CLI Executor Service
 *
 * Infrastructure implementation of IAgentExecutor for the GitHub Copilot CLI agent.
 * Executes prompts via the `copilot` CLI subprocess with JSONL output format.
 *
 * Key differences from other executors:
 * - Prompt is delivered via the -p flag (not stdin piping)
 * - Large prompts use temp-file indirection to avoid Windows ENAMETOOLONG spawn failures
 * - Auth is GitHub OAuth only — no API key injection is possible or supported
 * - --resume=<sessionId> format (with equals sign) for session resume
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
  AgentExecutionUsage,
  AgentExecutionStreamEvent,
} from '../../../../../application/ports/output/agents/agent-executor.interface.js';
import type { SpawnFunction } from '../types.js';
import { randomUUID } from 'node:crypto';
import { unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
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
} from './process-stream.js';
import {
  validateSecurityConstraints,
  type ExecutorCapabilities,
} from './security-constraint-validator.js';

/** Binary name on PATH. */
const COPILOT_BINARY = 'copilot';

/** Shown when the binary is missing, so the user knows how to fix it. */
const COPILOT_NOT_FOUND_MESSAGE =
  'GitHub Copilot CLI ("copilot") not found. ' +
  'Install via: npm install -g @githubnext/github-copilot-cli, ' +
  'then authenticate with: copilot auth login';

/** Shown when token auth is configured, which Copilot cannot use. */
const TOKEN_AUTH_UNSUPPORTED_MESSAGE =
  'GitHub Copilot CLI does not support token-based authentication. ' +
  'Auth is managed via GitHub OAuth. Run: copilot auth login';

/** Features supported by Copilot CLI */
const SUPPORTED_FEATURES = new Set<string>(['session-resume', 'streaming']);

/** Copilot JSONL event types. */
const EVENT_TYPE_MESSAGE_DELTA = 'assistant.message_delta';
const EVENT_TYPE_MESSAGE = 'assistant.message';
const EVENT_TYPE_RESULT = 'result';
const EVENT_TYPE_ERROR = 'error';

/**
 * Base flags always passed to the copilot CLI for non-interactive headless operation.
 * - --allow-all: bypass tool permission prompts (autonomous execution equivalent of --dangerously-skip-permissions)
 * - --output-format json: structured JSONL event stream on stdout
 * - -s: silent mode (suppress CLI progress UI on stderr, keeping it clean for error detection)
 * - --no-custom-instructions: disable repo-level custom instructions for predictable behavior
 * - --no-ask-user: never prompt for user input during execution
 */
const BASE_FLAGS = [
  '--allow-all',
  '--output-format',
  'json',
  '-s',
  '--no-custom-instructions',
  '--no-ask-user',
];

/**
 * Conservative threshold for prompt characters passed through CLI args.
 * Above this, we use file indirection to avoid process spawn arg-length failures.
 */
const MAX_PROMPT_ARG_CHARS = 12_000;

/** Prefix for temporary prompt files used by large prompt indirection mode. */
const PROMPT_FILE_PREFIX = 'shep-copilot-prompt-';

/**
 * Legacy model aliases that appeared in older settings payloads.
 * Copilot CLI expects dotted model versions (e.g. 4.5), not hyphenated (4-5).
 */
const LEGACY_MODEL_ALIASES: Record<string, string> = {
  'claude-sonnet-4-5': 'claude-sonnet-4.5',
  'claude-sonnet-4-6': 'claude-sonnet-4.6',
  'claude-opus-4-5': 'claude-opus-4.5',
  'claude-opus-4-6': 'claude-opus-4.6',
  'claude-opus-4-7': 'claude-opus-4.7',
  'claude-opus-4-8': 'claude-opus-4.8',
  'claude-haiku-4-5': 'claude-haiku-4.5',
  'gpt-4-1': 'gpt-4.1',
  'gpt-5-2': 'gpt-5.2',
  'gpt-5-3-codex': 'gpt-5.3-codex',
  'gpt-5-2-codex': 'gpt-5.2-codex',
  'gpt-5-4': 'gpt-5.4',
  'gpt-5-4-mini': 'gpt-5.4-mini',
};

interface PreparedPrompt {
  promptArg: string;
  usedFileIndirection: boolean;
  cleanup: () => Promise<void>;
}

/**
 * Flatten Copilot message content into plain text.
 *
 * `content` is a string on the simple path and an array of typed blocks when
 * the model emits structured output. Concatenating the raw value turned a
 * structured answer into "[object Object]" — a result that parses, stores and
 * reaches a PR body without anything noticing.
 */
function contentToText(content: unknown): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((block: { type?: string; text?: unknown }) => {
        if (typeof block === 'string') return block;
        if (block?.type === undefined || block.type === 'text') return asText(block?.text);
        return '';
      })
      .join('');
  }
  if (content && typeof content === 'object') {
    const block = content as { text?: unknown };
    if (block.text !== undefined) return asText(block.text);
  }
  return asText(content);
}

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

/**
 * Executor service for GitHub Copilot CLI agent.
 * Uses subprocess spawning to interact with the `copilot` CLI.
 */
export class CopilotCliExecutorService implements IAgentExecutor {
  readonly agentType: AgentType = 'copilot-cli' as AgentType;

  constructor(
    private readonly spawn: SpawnFunction,
    private readonly authConfig?: AgentConfig
  ) {}

  /** Executor capabilities for security constraint validation */
  private static readonly CAPABILITIES: ExecutorCapabilities = {
    requiresPermissiveMode: true, // uses --allow-all (bypasses tool permission prompts)
    executorName: 'copilot-cli',
  };

  supportsFeature(feature: AgentFeature): boolean {
    return SUPPORTED_FEATURES.has(feature as string);
  }

  async execute(prompt: string, options?: AgentExecutionOptions): Promise<AgentExecutionResult> {
    const log = this.startRun(options);

    // Copilot CLI is OAuth-only. Surface a clear error if token auth is attempted.
    if (this.authConfig?.authMethod === 'token') {
      throw new Error(TOKEN_AUTH_UNSUPPORTED_MESSAGE);
    }

    let preparedPrompt = this.prepareDirectPrompt(prompt);
    if (this.shouldUsePromptFile(prompt)) {
      preparedPrompt = await this.preparePromptFileIndirection(prompt);
    }
    const args = this.buildArgs(preparedPrompt.promptArg, options, log);
    const spawnOpts = buildSpawnOptions({ cwd: options?.cwd });

    log(
      `Spawning: ${COPILOT_BINARY} ${args.map((a) => (a.length > 80 ? `${a.slice(0, 77)}...` : a)).join(' ')}`
    );
    log(`Spawn cwd: ${(spawnOpts.cwd as string) ?? '(inherited)'}`);

    let proc: ReturnType<SpawnFunction>;
    try {
      proc = this.spawn(COPILOT_BINARY, args, spawnOpts);
    } catch (error) {
      await preparedPrompt.cleanup();
      throw error;
    }
    log(`Subprocess PID: ${proc.pid ?? 'undefined (spawn may have failed)'}`);
    log(
      `Prompt length: ${prompt.length} chars (${preparedPrompt.usedFileIndirection ? 'delivered via temp prompt file indirection' : 'delivered via -p flag'})`
    );

    const executionPromise = new Promise<AgentExecutionResult>((resolve, reject) => {
      const stderr = createStderrTail();
      let resultText = '';
      let sessionId: string | undefined;
      let usage: AgentExecutionUsage | undefined;
      /** True once Copilot emitted its terminal `result` event. */
      let resultSeen = false;
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
          const parsed = parseJsonLine(line);
          if (!parsed) return; // Malformed JSON line — skip gracefully

          if (parsed.type === EVENT_TYPE_MESSAGE && parsed.content) {
            resultText += contentToText(parsed.content);
          } else if (parsed.type === EVENT_TYPE_RESULT) {
            resultSeen = true;
            if (typeof parsed.sessionId === 'string') sessionId = parsed.sessionId;
            if (parsed.usage) usage = extractUsage(parsed.usage as Record<string, unknown>);
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
        settle(() => reject(classifySpawnError(error, COPILOT_NOT_FOUND_MESSAGE)));
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
            // Check for auth-specific error patterns to provide actionable guidance
            const authError = detectAuthError(stderr.text());
            if (authError) {
              reject(new Error(authError));
              return;
            }
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

          // A signal kill (OOM killer, external kill) before the terminal
          // `result` event cut the turn short, however much text had arrived.
          if (code === null && !resultSeen) {
            reject(new Error(signalTerminationMessage(signal, stderr.text())));
            return;
          }

          const result: AgentExecutionResult = { result: resultText };
          if (sessionId) result.sessionId = sessionId;
          if (usage) result.usage = usage;
          resolve(result);
        });
      });
    });

    return executionPromise.finally(async () => {
      await preparedPrompt.cleanup();
    });
  }

  async *executeStream(
    prompt: string,
    options?: AgentExecutionOptions
  ): AsyncIterable<AgentExecutionStreamEvent> {
    const log = this.startRun(options);

    // Copilot CLI is OAuth-only. Surface a clear error if token auth is attempted.
    if (this.authConfig?.authMethod === 'token') {
      yield {
        type: 'error',
        content: TOKEN_AUTH_UNSUPPORTED_MESSAGE,
        timestamp: new Date(),
      };
      return;
    }

    let preparedPrompt = this.prepareDirectPrompt(prompt);
    if (this.shouldUsePromptFile(prompt)) {
      preparedPrompt = await this.preparePromptFileIndirection(prompt);
    }
    const args = this.buildArgs(preparedPrompt.promptArg, options, log);
    const spawnOpts = buildSpawnOptions({ cwd: options?.cwd });
    let proc: ReturnType<SpawnFunction>;
    try {
      proc = this.spawn(COPILOT_BINARY, args, spawnOpts);
    } catch (error) {
      await preparedPrompt.cleanup();
      yield {
        type: 'error',
        content: (error as Error).message,
        timestamp: new Date(),
      };
      return;
    }

    const channel = new EventChannel<AgentExecutionStreamEvent>();
    const stderr = createStderrTail();
    /** Accumulated final response text (from assistant.message events) */
    let resultText = '';
    /** True once Copilot emitted its terminal `result` event. */
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
      if (!parsed) {
        // Non-JSON line — emit as raw progress
        channel.push({ type: 'progress', content: line, timestamp: new Date() });
        return;
      }

      if (parsed.type === EVENT_TYPE_MESSAGE_DELTA && parsed.delta) {
        channel.push({
          type: 'progress',
          content: contentToText(parsed.delta),
          timestamp: new Date(),
        });
        return;
      }

      if (parsed.type === EVENT_TYPE_MESSAGE && parsed.content) {
        // Accumulate final text; streaming progress already yielded via deltas
        resultText += contentToText(parsed.content);
        return;
      }

      if (parsed.type === EVENT_TYPE_RESULT) {
        resultSeen = true;
        // Final event — yield result with accumulated text
        const event: AgentExecutionStreamEvent = {
          type: 'result',
          content: resultText,
          timestamp: new Date(),
        };
        if (typeof parsed.sessionId === 'string') event.sessionId = parsed.sessionId;
        channel.push(event);
        return;
      }

      if (parsed.type === EVENT_TYPE_ERROR) {
        channel.push({
          type: 'error',
          content: asText(parsed.message ?? parsed.content) || 'Unknown error',
          timestamp: new Date(),
        });
      }

      // Unknown event types — skip gracefully
    });

    proc.stdout?.on('data', (chunk: Buffer | string) => accumulator.push(chunk));
    proc.stderr?.on('data', (chunk: Buffer | string) => stderr.push(chunk));

    proc.on('error', (error: Error & { code?: string }) => {
      processClosed = true;
      if (timeoutId) clearTimeout(timeoutId);
      channel.push({
        type: 'error',
        content: classifySpawnError(error, COPILOT_NOT_FOUND_MESSAGE).message,
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
        const authError = detectAuthError(stderr.text());
        const detail = stderr.text().trim();
        channel.push({
          type: 'error',
          content:
            authError ??
            (detail
              ? `Process exited with code ${code}: ${detail}`
              : `Process exited with code ${code}`),
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
      // A consumer that breaks out of the loop would otherwise leave the agent
      // running until it finished on its own.
      if (!processClosed) terminateWithEscalation(proc);
      await preparedPrompt.cleanup();
    }
  }

  /** Validate policy and build the per-call logger shared by both entry points. */
  private startRun(options?: AgentExecutionOptions): ExecutorLogger {
    const log = createExecutorLogger(options?.silent);
    const warning = validateSecurityConstraints(
      options?.securityConstraints,
      CopilotCliExecutorService.CAPABILITIES
    );
    if (warning) log(warning);
    return log;
  }

  /**
   * Build CLI args for the copilot invocation.
   * Prompt is passed via -p flag (not stdin).
   */
  private buildArgs(
    prompt: string,
    options: AgentExecutionOptions | undefined,
    log: ExecutorLogger
  ): string[] {
    const args = ['-p', prompt, ...BASE_FLAGS];

    if (options?.model) {
      args.push('--model', this.normalizeModel(options.model, log));
    }
    if (options?.resumeSession) args.push(`--resume=${options.resumeSession}`);

    // Unsupported options — log and ignore
    if (options?.allowedTools?.length) {
      log('allowedTools option is not supported by Copilot CLI — ignoring');
    }
    if (options?.systemPrompt) {
      log('systemPrompt option is not supported by Copilot CLI — ignoring');
    }
    if (options?.outputSchema) {
      log('outputSchema option is not supported by Copilot CLI — ignoring');
    }

    return args;
  }

  /**
   * Normalize legacy model names to the canonical Copilot CLI form.
   */
  private normalizeModel(model: string, log: ExecutorLogger): string {
    const alias = LEGACY_MODEL_ALIASES[model];
    if (alias) {
      log(`Normalizing legacy model alias "${model}" to "${alias}"`);
      return alias;
    }

    // Generic fallback for legacy GPT names like gpt-5-2-codex -> gpt-5.2-codex.
    const genericGptAlias = model.replace(/^gpt-(\d+)-(\d+)(.*)$/i, 'gpt-$1.$2$3');
    if (genericGptAlias !== model) {
      log(`Normalizing legacy model alias "${model}" to "${genericGptAlias}"`);
      return genericGptAlias;
    }

    return model;
  }

  /**
   * Prepare prompt delivery for Copilot CLI.
   * Uses temporary file indirection for large prompts to avoid ENAMETOOLONG.
   */
  private shouldUsePromptFile(prompt: string): boolean {
    return prompt.length > MAX_PROMPT_ARG_CHARS;
  }

  private prepareDirectPrompt(prompt: string): PreparedPrompt {
    return {
      promptArg: prompt,
      usedFileIndirection: false,
      cleanup: async () => {
        // No temp file created for short prompts.
      },
    };
  }

  private async preparePromptFileIndirection(prompt: string): Promise<PreparedPrompt> {
    const promptFilePath = join(tmpdir(), `${PROMPT_FILE_PREFIX}${randomUUID()}.txt`);
    await writeFile(promptFilePath, prompt, 'utf8');

    const promptArg =
      'The full original user prompt is stored in this file:\n' +
      `${promptFilePath}\n` +
      'Read that file completely, then execute its instructions exactly as if its content was passed directly as the prompt. ' +
      'Do not summarize or reinterpret the instructions before executing them.';

    return {
      promptArg,
      usedFileIndirection: true,
      cleanup: async () => {
        try {
          await unlink(promptFilePath);
        } catch {
          // Ignore cleanup failures (file may already be gone).
        }
      },
    };
  }
}

/**
 * Extract token usage from the Copilot CLI result event usage object.
 * Returns undefined if usage data is absent (does not throw).
 */
function extractUsage(
  usage: Record<string, unknown>
): { inputTokens: number; outputTokens: number } | undefined {
  if (typeof usage.inputTokens !== 'number' || typeof usage.outputTokens !== 'number') {
    return undefined;
  }
  return { inputTokens: usage.inputTokens, outputTokens: usage.outputTokens };
}

/**
 * Detect authentication-related errors in stderr and return a user-friendly message.
 * Returns null if no auth error is detected.
 */
function detectAuthError(stderr: string): string | null {
  if (!stderr) return null;
  const lowerStderr = stderr.toLowerCase();
  if (
    lowerStderr.includes('not logged in') ||
    lowerStderr.includes('authentication') ||
    lowerStderr.includes('auth') ||
    lowerStderr.includes('unauthorized') ||
    lowerStderr.includes('login required')
  ) {
    return (
      'GitHub Copilot CLI authentication required. ' +
      'Run: copilot auth login\n' +
      `Original error: ${stderr.trim()}`
    );
  }
  return null;
}
