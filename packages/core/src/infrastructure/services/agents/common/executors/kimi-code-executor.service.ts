/**
 * Kimi Code Executor Service
 *
 * Infrastructure implementation of IAgentExecutor for Moonshot AI's Kimi Code
 * CLI (the `kimi` binary).
 *
 * Kimi runs headlessly in "print mode": `--print` disables the interactive TUI
 * and implicitly enables `--afk`, which auto-approves tool calls. We pass
 * `--afk` explicitly rather than relying on that implication, because an agent
 * that silently starts waiting for keyboard approval inside a detached worker
 * would hang until the run times out.
 *
 * Output is newline-delimited JSON (`--output-format stream-json`): one message
 * object per line, in OpenAI chat shape — `{role: 'assistant', content, tool_calls?}`
 * and `{role: 'tool', tool_call_id, content}`.
 *
 * Exit codes are meaningful and distinguish retryable failures:
 *   0  success
 *   1  permanent failure (config, auth, quota)
 *   75 transient failure (rate limit, 5xx, timeout) — worth retrying
 *
 * Reference: https://moonshotai.github.io/kimi-cli/en/reference/kimi-command.html
 * and https://moonshotai.github.io/kimi-cli/en/customization/print-mode.html
 *
 * Uses constructor dependency injection for the spawn function to enable
 * testability without mocking node:child_process directly.
 */

import { randomUUID } from 'node:crypto';
import type {
  AgentType,
  AgentFeature,
  AgentConfig,
} from '../../../../../domain/generated/output.js';
import { AgentAuthMethod } from '../../../../../domain/generated/output.js';
import type {
  IAgentExecutor,
  AgentExecutionOptions,
  AgentExecutionResult,
  AgentExecutionStreamEvent,
} from '../../../../../application/ports/output/agents/agent-executor.interface.js';
import type { SpawnFunction } from '../types.js';
import {
  validateSecurityConstraints,
  type ExecutorCapabilities,
} from './security-constraint-validator.js';
import { createExecutorLogger, type ExecutorLogger } from './executor-logger.js';
import {
  agentTimeoutMessage,
  createLineAccumulator,
  createStderrTail,
  killProcessTree,
  signalTerminationMessage,
  terminateWithEscalation,
  writePromptToStdin,
} from './process-stream.js';

/** Binary name on PATH. */
const KIMI_BINARY = 'kimi';

/**
 * Exit code Kimi uses for retryable failures (rate limits, 5xx, timeouts).
 * Callers distinguish these from permanent failures so a backoff retry is
 * worth attempting.
 */
const EXIT_CODE_TRANSIENT_FAILURE = 75;

/**
 * Environment variable carrying the API key for token auth.
 *
 * Kimi deliberately does NOT read credentials from the shell environment; the
 * only environment variable it honours is the one a provider names via
 * `api_key_env`. So we set the variable AND tell Kimi to read it, via inline
 * config. This keeps the secret out of argv, which is world-readable through
 * /proc on Linux.
 */
const KIMI_API_KEY_ENV = 'KIMI_API_KEY';

/** Provider key Kimi uses for Moonshot's own API in config.toml. */
const KIMI_PROVIDER_NAME = 'kimi';

/** Grace period before escalating a timed-out process from SIGTERM to SIGKILL. */
const SIGKILL_GRACE_MS = 5_000;

/**
 * Features supported by Kimi Code CLI.
 *
 * `--session <id>` both creates and resumes, so session resume is real.
 * Structured output, tool scoping and session listing have no CLI equivalent
 * and are deliberately not claimed — an executor that over-claims a feature
 * makes callers silently pass options that are dropped.
 */
const SUPPORTED_FEATURES = new Set<string>(['session-resume', 'streaming']);

/** Assistant content is either a plain string or an array of typed blocks. */
interface KimiContentBlock {
  type?: string;
  text?: string;
}

interface KimiMessage {
  role?: string;
  content?: string | KimiContentBlock[];
  tool_calls?: { function?: { name?: string } }[];
}

/** Flatten Kimi's string-or-blocks content into plain text. */
function contentToText(content: KimiMessage['content']): string {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content
    .filter((block) => block.type === undefined || block.type === 'text')
    .map((block) => block.text ?? '')
    .join('');
}

/** Names of the tools invoked by an assistant message, if any. */
function toolNames(message: KimiMessage): string[] {
  if (!Array.isArray(message.tool_calls)) return [];
  return message.tool_calls
    .map((call) => call.function?.name)
    .filter((name): name is string => typeof name === 'string' && name.length > 0);
}

/**
 * Executor service for Moonshot AI's Kimi Code CLI.
 * Uses subprocess spawning to interact with the `kimi` binary.
 */
export class KimiCodeExecutorService implements IAgentExecutor {
  readonly agentType: AgentType = 'kimi-code' as AgentType;

  constructor(
    private readonly spawn: SpawnFunction,
    private readonly authConfig?: AgentConfig
  ) {}

  /** Executor capabilities for security constraint validation */
  private static readonly CAPABILITIES: ExecutorCapabilities = {
    requiresPermissiveMode: true, // uses --afk (auto-approves every tool call)
    executorName: 'kimi-code',
  };

  supportsFeature(feature: AgentFeature): boolean {
    return SUPPORTED_FEATURES.has(feature as string);
  }

  /** Validate policy and build the per-call logger shared by both entry points. */
  private startRun(options?: AgentExecutionOptions): ExecutorLogger {
    const log = createExecutorLogger(options?.silent);
    const warning = validateSecurityConstraints(
      options?.securityConstraints,
      KimiCodeExecutorService.CAPABILITIES
    );
    if (warning) log(warning);
    return log;
  }

  async execute(prompt: string, options?: AgentExecutionOptions): Promise<AgentExecutionResult> {
    const log = this.startRun(options);

    const sessionId = options?.resumeSession ?? randomUUID();
    const args = this.buildArgs(sessionId, options);
    const proc = this.spawnKimi(prompt, args, options, log);

    return new Promise<AgentExecutionResult>((resolve, reject) => {
      const stderr = createStderrTail();
      let resultText = '';
      let rawText = '';
      let settled = false;
      let timeoutId: ReturnType<typeof setTimeout> | undefined;
      let sigkillId: ReturnType<typeof setTimeout> | undefined;

      const clearTimers = () => {
        if (timeoutId) clearTimeout(timeoutId);
        if (sigkillId) clearTimeout(sigkillId);
      };

      /** Settle exactly once — a kill may or may not be followed by 'close'. */
      const settle = (outcome: () => void): void => {
        if (settled) return;
        settled = true;
        clearTimers();
        outcome();
      };

      const timeoutMs = options?.timeout;
      if (timeoutMs) {
        timeoutId = setTimeout(() => {
          log(`Timeout after ${timeoutMs}ms — terminating agent`);
          killProcessTree(proc);
          // SIGTERM is a request the child may ignore. Escalate to SIGKILL so
          // the process cannot survive, and reject NOW rather than waiting for
          // a 'close' event that a wedged child may never emit — that is how a
          // timed-out run turns into a permanently pending promise.
          sigkillId = setTimeout(() => {
            try {
              proc.kill('SIGKILL');
            } catch {
              /* already gone */
            }
          }, SIGKILL_GRACE_MS);
          sigkillId.unref?.();
          settle(() => reject(new Error(agentTimeoutMessage(timeoutMs))));
        }, timeoutMs);
      }

      const accumulator = createLineAccumulator(
        (line) => {
          const message = this.parseMessage(line);
          if (message === null) {
            rawText += `${line}\n`;
            log(`[raw] ${line}`);
            return;
          }
          if (message.role !== 'assistant') return; // tool results are not the answer
          const text = contentToText(message.content);
          if (text) {
            resultText += text;
            log(`[text] ${text.replace(/\n/g, ' ')}`);
          }
          for (const name of toolNames(message)) log(`[tool] ${name}`);
        },
        {
          onOverflow: (dropped) =>
            log(`[warn] discarded ${dropped} bytes of un-terminated agent output`),
        }
      );

      proc.stdout?.on('data', (chunk: Buffer | string) => accumulator.push(chunk));

      proc.stderr?.on('data', (chunk: Buffer | string) => {
        stderr.push(chunk);
        log(`stderr: ${chunk.toString().trimEnd()}`);
      });

      proc.on('error', (error: Error & { code?: string }) => {
        settle(() => {
          if (error.code === 'ENOENT') {
            reject(
              new Error(
                'Kimi Code CLI not found. Install it with `curl -fsSL https://code.kimi.com/install.sh | bash` ' +
                  'and ensure the "kimi" command is on PATH.'
              )
            );
            return;
          }
          reject(error);
        });
      });

      proc.on('close', (code: number | null, signal: NodeJS.Signals | null) => {
        accumulator.flush();

        const finalText = resultText || rawText.trim();
        log(`Process closed with code ${code}, result=${finalText.length} chars`);

        settle(() => {
          if (code === EXIT_CODE_TRANSIENT_FAILURE) {
            reject(
              new Error(
                `Kimi Code reported a transient failure (exit ${EXIT_CODE_TRANSIENT_FAILURE}) — rate limit, upstream 5xx or timeout. ${stderr.text().trim()}`.trim()
              )
            );
            return;
          }

          if (code !== 0 && code !== null) {
            reject(new Error(stderr.text().trim() || `Process exited with code ${code}`));
            return;
          }

          // code === null means a signal killed the agent (OOM killer, an
          // external kill). Kimi's output has no terminal event, so text that
          // arrived before the kill cannot be told apart from a finished turn —
          // a kill is always a failure, never a partial answer.
          if (code === null) {
            reject(new Error(signalTerminationMessage(signal, stderr.text())));
            return;
          }

          resolve({ result: finalText, sessionId });
        });
      });
    });
  }

  async *executeStream(
    prompt: string,
    options?: AgentExecutionOptions
  ): AsyncIterable<AgentExecutionStreamEvent> {
    const log = this.startRun(options);

    const sessionId = options?.resumeSession ?? randomUUID();
    const args = this.buildArgs(sessionId, options);
    const proc = this.spawnKimi(prompt, args, options, log);

    const queue: (AgentExecutionStreamEvent | null)[] = [];
    let notify: (() => void) | null = null;
    let failure: Error | null = null;

    const enqueue = (event: AgentExecutionStreamEvent | null): void => {
      queue.push(event);
      if (notify) {
        notify();
        notify = null;
      }
    };

    const waitForItem = (): Promise<void> => {
      if (queue.length > 0) return Promise.resolve();
      return new Promise<void>((r) => {
        notify = r;
      });
    };

    const stderr = createStderrTail();
    /** Assistant text seen so far — the answer the result event announces. */
    let resultText = '';
    let processClosed = false;
    /** The timeout already reported the outcome; the kill's 'close' must not. */
    let timedOut = false;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    const timeoutMs = options?.timeout;
    if (timeoutMs) {
      timeoutId = setTimeout(() => {
        timedOut = true;
        log(`Timeout after ${timeoutMs}ms — terminating agent`);
        terminateWithEscalation(proc);
        enqueue({ type: 'error', content: agentTimeoutMessage(timeoutMs), timestamp: new Date() });
      }, timeoutMs);
    }

    const accumulator = createLineAccumulator((line) => {
      // Accumulate assistant TEXT only: a tool-call announcement is progress
      // for a human, not part of the answer the result event carries.
      const message = this.parseMessage(line);
      if (message?.role === 'assistant') resultText += contentToText(message.content);

      const event = this.parseStreamLine(line);
      if (event) enqueue(event);
    });

    proc.stdout?.on('data', (chunk: Buffer | string) => accumulator.push(chunk));
    proc.stderr?.on('data', (chunk: Buffer | string) => stderr.push(chunk));

    proc.on('error', (error: Error) => {
      processClosed = true;
      if (timeoutId) clearTimeout(timeoutId);
      failure = error;
      enqueue(null);
    });

    proc.on('close', (code: number | null, signal: NodeJS.Signals | null) => {
      processClosed = true;
      accumulator.flush();
      if (timeoutId) clearTimeout(timeoutId);

      if (timedOut) {
        // Already reported by the timeout callback.
      } else if (code !== 0 && code !== null) {
        const detail = stderr.text().trim() || `Process exited with code ${code}`;
        const content =
          code === EXIT_CODE_TRANSIENT_FAILURE
            ? `Kimi Code reported a transient failure (exit ${code}) — ${detail}`
            : detail;
        enqueue({ type: 'error', content, timestamp: new Date() });
      } else if (code === null) {
        // No terminal event exists in Kimi's output: a kill is never a result.
        enqueue({
          type: 'error',
          content: signalTerminationMessage(signal, stderr.text()),
          timestamp: new Date(),
        });
      } else {
        // The session id identifies the conversation; it is NOT the answer.
        // Returning it as `content` handed every downstream node a UUID.
        enqueue({ type: 'result', content: resultText, sessionId, timestamp: new Date() });
      }
      enqueue(null);
    });

    try {
      while (true) {
        await waitForItem();
        const item = queue.shift();
        if (item === null || item === undefined) {
          if (failure !== null) {
            yield { type: 'error', content: (failure as Error).message, timestamp: new Date() };
          }
          return;
        }
        yield item;
      }
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
      // A consumer that breaks out of the loop would otherwise leave the agent
      // running until it finished on its own.
      if (!processClosed) terminateWithEscalation(proc);
    }
  }

  /** Parse one NDJSON line, or null when it is not JSON. */
  private parseMessage(line: string): KimiMessage | null {
    try {
      const parsed: unknown = JSON.parse(line);
      if (parsed === null || typeof parsed !== 'object') return null;
      return parsed as KimiMessage;
    } catch {
      return null;
    }
  }

  /** Map one NDJSON line to a stream event, or null when it carries nothing. */
  private parseStreamLine(line: string): AgentExecutionStreamEvent | null {
    const message = this.parseMessage(line);
    if (message === null) {
      return { type: 'progress', content: line, timestamp: new Date() };
    }
    if (message.role !== 'assistant') return null;

    const text = contentToText(message.content);
    if (text) return { type: 'progress', content: text, timestamp: new Date() };

    const tools = toolNames(message);
    if (tools.length > 0) {
      return { type: 'progress', content: `Tool call: ${tools.join(', ')}`, timestamp: new Date() };
    }
    return null;
  }

  /**
   * Build the argv for a headless run.
   *
   * The prompt is NOT included — it is piped via stdin so it never appears in
   * the process table and cannot hit an argv length limit.
   */
  private buildArgs(sessionId: string, options?: AgentExecutionOptions): string[] {
    const args = ['--print', '--output-format', 'stream-json', '--afk', '--session', sessionId];

    if (options?.cwd) args.push('--work-dir', options.cwd);
    if (options?.model) args.push('--model', options.model);
    if (options?.maxTurns) args.push('--max-steps-per-turn', String(options.maxTurns));

    // Token auth: name the environment variable holding the key rather than
    // inlining the key itself, so the secret stays out of argv.
    if (this.authConfig?.authMethod === AgentAuthMethod.Token && this.authConfig.token) {
      args.push(
        '--config',
        JSON.stringify({
          providers: { [KIMI_PROVIDER_NAME]: { api_key_env: KIMI_API_KEY_ENV } },
        })
      );
    }

    // Unsupported options silently omitted: systemPrompt, allowedTools,
    // outputSchema, tools, disableMcp, mcpConfigPath.
    return args;
  }

  /** Spawn `kimi` and write the prompt to its stdin. */
  private spawnKimi(
    prompt: string,
    args: string[],
    options: AgentExecutionOptions | undefined,
    log: ExecutorLogger
  ): ReturnType<SpawnFunction> {
    const spawnOpts = this.buildSpawnOptions(options);

    log(
      `Spawning: ${KIMI_BINARY} ${args.map((a) => (a.length > 80 ? `${a.slice(0, 77)}...` : a)).join(' ')}`
    );
    log(`Spawn cwd: ${(spawnOpts.cwd as string) ?? '(inherited)'}`);

    const proc = this.spawn(KIMI_BINARY, args, spawnOpts);
    log(`Subprocess PID: ${proc.pid ?? 'undefined (spawn may have failed)'}`);
    log(`Prompt length: ${prompt.length} chars (piped via stdin)`);

    // The error handler matters: the CLI exits early on a bad flag or an auth
    // failure, and the resulting EPIPE would otherwise reach
    // process.on('uncaughtException') and take the whole worker down.
    writePromptToStdin(proc, prompt, (error) =>
      log(`stdin closed before the prompt was written (${error.code ?? error.message})`)
    );

    return proc;
  }

  private buildSpawnOptions(options?: AgentExecutionOptions): Record<string, unknown> {
    const spawnOpts: Record<string, unknown> = {
      stdio: ['pipe', 'pipe', 'pipe'],
    };

    if (options?.cwd) spawnOpts.cwd = options.cwd;
    if (process.platform === 'win32') spawnOpts.windowsHide = true;

    // Strip CLAUDECODE so a nested agent does not detect a parent session.
    const { CLAUDECODE: _ignored, ...cleanEnv } = process.env;

    if (this.authConfig?.authMethod === AgentAuthMethod.Token && this.authConfig.token) {
      spawnOpts.env = { ...cleanEnv, [KIMI_API_KEY_ENV]: this.authConfig.token };
    } else {
      spawnOpts.env = cleanEnv;
    }

    return spawnOpts;
  }
}
