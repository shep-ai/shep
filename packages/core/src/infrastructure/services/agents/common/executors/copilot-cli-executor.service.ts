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
import { getCurrentPhase, getLogPrefix } from '../../feature-agent/log-context.js';
import { randomUUID } from 'node:crypto';
import { unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

/** Features supported by Copilot CLI */
const SUPPORTED_FEATURES = new Set<string>(['session-resume', 'streaming']);

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
  'gpt-5-2-codex': 'gpt-5.2-codex',
  'gpt-5-3-codex': 'gpt-5.3-codex',
  'gpt-5-4': 'gpt-5.4',
  'gpt-5-4-mini': 'gpt-5.4-mini',
};

interface PreparedPrompt {
  promptArg: string;
  usedFileIndirection: boolean;
  cleanup: () => Promise<void>;
}

/**
 * Executor service for GitHub Copilot CLI agent.
 * Uses subprocess spawning to interact with the `copilot` CLI.
 */
export class CopilotCliExecutorService implements IAgentExecutor {
  readonly agentType: AgentType = 'copilot-cli' as AgentType;

  /** When true, suppresses debug logging (set per-call via options.silent) */
  private silent = false;

  constructor(
    private readonly spawn: SpawnFunction,
    private readonly authConfig?: AgentConfig
  ) {}

  /** Debug logging — writes to stdout so it appears in the worker log file */
  private log(message: string): void {
    if (this.silent) return;
    const ts = new Date().toISOString();
    process.stdout.write(`[${ts}] ${getCurrentPhase()}${getLogPrefix()}${message}\n`);
  }

  supportsFeature(feature: AgentFeature): boolean {
    return SUPPORTED_FEATURES.has(feature as string);
  }

  async execute(prompt: string, options?: AgentExecutionOptions): Promise<AgentExecutionResult> {
    this.silent = options?.silent ?? false;

    // Copilot CLI is OAuth-only. Surface a clear error if token auth is attempted.
    if (this.authConfig?.authMethod === 'token') {
      throw new Error(
        'GitHub Copilot CLI does not support token-based authentication. ' +
          'Auth is managed via GitHub OAuth. Run: copilot auth login'
      );
    }

    let preparedPrompt = this.prepareDirectPrompt(prompt);
    if (this.shouldUsePromptFile(prompt)) {
      preparedPrompt = await this.preparePromptFileIndirection(prompt);
    }
    const args = this.buildArgs(preparedPrompt.promptArg, options);
    const spawnOpts = this.buildSpawnOptions(options);

    this.log(
      `Spawning: copilot ${args.map((a) => (a.length > 80 ? `${a.slice(0, 77)}...` : a)).join(' ')}`
    );
    this.log(`Spawn cwd: ${(spawnOpts.cwd as string) ?? '(inherited)'}`);

    let proc: ReturnType<SpawnFunction>;
    try {
      proc = this.spawn('copilot', args, spawnOpts);
    } catch (error) {
      await preparedPrompt.cleanup();
      throw error;
    }
    this.log(`Subprocess PID: ${proc.pid ?? 'undefined (spawn may have failed)'}`);
    this.log(
      `Prompt length: ${prompt.length} chars (${preparedPrompt.usedFileIndirection ? 'delivered via temp prompt file indirection' : 'delivered via -p flag'})`
    );

    const executionPromise = new Promise<AgentExecutionResult>((resolve, reject) => {
      let lineBuffer = '';
      let stderr = '';
      let timedOut = false;
      let timeoutId: ReturnType<typeof setTimeout> | undefined;

      // State accumulated from JSONL events
      let resultText = '';
      let sessionId: string | undefined;
      let usage: AgentExecutionUsage | undefined;

      if (options?.timeout) {
        timeoutId = setTimeout(() => {
          timedOut = true;
          proc.kill();
        }, options.timeout);
      }

      const processLine = (line: string) => {
        try {
          const parsed = JSON.parse(line) as Record<string, unknown>;
          const type = parsed.type as string;

          if (type === 'assistant.message' && parsed.content) {
            resultText += parsed.content as string;
          } else if (type === 'result') {
            if (parsed.sessionId) sessionId = parsed.sessionId as string;
            if (parsed.usage) usage = this.extractUsage(parsed.usage as Record<string, unknown>);
          }
        } catch {
          // Malformed JSON line — skip gracefully
        }
      };

      proc.stdout?.on('data', (chunk: Buffer | string) => {
        lineBuffer += chunk.toString();
        const lines = lineBuffer.split('\n');
        lineBuffer = lines.pop() ?? '';
        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed) processLine(trimmed);
        }
      });

      proc.stderr?.on('data', (chunk: Buffer | string) => {
        const data = chunk.toString();
        stderr += data;
        this.log(`stderr: ${data.trimEnd()}`);
      });

      proc.on('error', (error: Error & { code?: string }) => {
        this.log(`Process error event: ${error.message}`);
        if (timeoutId) clearTimeout(timeoutId);
        if (error.code === 'ENOENT') {
          reject(
            new Error(
              'GitHub Copilot CLI ("copilot") not found. ' +
                'Install via: npm install -g @githubnext/github-copilot-cli, ' +
                'then authenticate with: copilot auth login'
            )
          );
        } else {
          reject(error);
        }
      });

      proc.on('close', (code: number | null) => {
        // Flush remaining line buffer
        if (lineBuffer.trim()) processLine(lineBuffer.trim());

        this.log(`Process closed with code ${code}, result=${resultText.length} chars`);
        if (timeoutId) clearTimeout(timeoutId);

        if (timedOut) {
          reject(new Error('Agent execution timed out'));
          return;
        }

        if (code !== 0 && code !== null) {
          // Check for auth-specific error patterns to provide actionable guidance
          const authError = this.detectAuthError(stderr);
          if (authError) {
            reject(new Error(authError));
            return;
          }
          const message = stderr.trim()
            ? `Process exited with code ${code}: ${stderr.trim()}`
            : `Process exited with code ${code}`;
          reject(new Error(message));
          return;
        }

        const result: AgentExecutionResult = { result: resultText };
        if (sessionId) result.sessionId = sessionId;
        if (usage) result.usage = usage;
        resolve(result);
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
    this.silent = options?.silent ?? false;

    // Copilot CLI is OAuth-only. Surface a clear error if token auth is attempted.
    if (this.authConfig?.authMethod === 'token') {
      yield {
        type: 'error',
        content:
          'GitHub Copilot CLI does not support token-based authentication. ' +
          'Auth is managed via GitHub OAuth. Run: copilot auth login',
        timestamp: new Date(),
      };
      return;
    }

    let preparedPrompt = this.prepareDirectPrompt(prompt);
    if (this.shouldUsePromptFile(prompt)) {
      preparedPrompt = await this.preparePromptFileIndirection(prompt);
    }
    const args = this.buildArgs(preparedPrompt.promptArg, options);
    const spawnOpts = this.buildSpawnOptions(options);
    let proc: ReturnType<SpawnFunction>;
    try {
      proc = this.spawn('copilot', args, spawnOpts);
    } catch (error) {
      await preparedPrompt.cleanup();
      yield {
        type: 'error',
        content: (error as Error).message,
        timestamp: new Date(),
      };
      return;
    }

    let lineBuffer = '';
    let stderr = '';
    let timedOut = false;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    // Accumulated final response text (from assistant.message events)
    let resultText = '';

    const queue: (AgentExecutionStreamEvent | null)[] = [];
    let resolveWait: (() => void) | null = null;
    let spawnError: Error | null = null;

    function enqueue(event: AgentExecutionStreamEvent | null) {
      queue.push(event);
      if (resolveWait) {
        resolveWait();
        resolveWait = null;
      }
    }

    function waitForItem(): Promise<void> {
      if (queue.length > 0) return Promise.resolve();
      return new Promise<void>((r) => {
        resolveWait = r;
      });
    }

    if (options?.timeout) {
      timeoutId = setTimeout(() => {
        timedOut = true;
        proc.kill();
        enqueue({ type: 'error', content: 'Agent execution timed out', timestamp: new Date() });
        enqueue(null);
      }, options.timeout);
    }

    const processStreamLine = (line: string) => {
      try {
        const parsed = JSON.parse(line) as Record<string, unknown>;
        const type = parsed.type as string;

        if (type === 'assistant.message_delta' && parsed.delta) {
          enqueue({
            type: 'progress',
            content: parsed.delta as string,
            timestamp: new Date(),
          });
          return;
        }

        if (type === 'assistant.message' && parsed.content) {
          // Accumulate final text; streaming progress already yielded via deltas
          resultText += parsed.content as string;
          return;
        }

        if (type === 'result') {
          // Final event — yield result with accumulated text
          enqueue({
            type: 'result',
            content: resultText,
            timestamp: new Date(),
          });
          return;
        }

        if (type === 'error') {
          enqueue({
            type: 'error',
            content: (parsed.message as string) ?? (parsed.content as string) ?? 'Unknown error',
            timestamp: new Date(),
          });
          return;
        }

        // Unknown event types — skip gracefully
      } catch {
        // Non-JSON line — emit as raw progress
        enqueue({ type: 'progress', content: line, timestamp: new Date() });
      }
    };

    proc.stdout?.on('data', (chunk: Buffer | string) => {
      lineBuffer += chunk.toString();
      const lines = lineBuffer.split('\n');
      lineBuffer = lines.pop() ?? '';
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        processStreamLine(trimmed);
      }
    });

    proc.stderr?.on('data', (chunk: Buffer | string) => {
      stderr += chunk.toString();
    });

    proc.on('error', (err: Error) => {
      if (timeoutId) clearTimeout(timeoutId);
      spawnError = err;
      enqueue(null);
    });

    proc.on('close', (code: number | null) => {
      if (timeoutId) clearTimeout(timeoutId);
      if (timedOut) return; // already handled by timeout callback

      if (lineBuffer.trim()) {
        processStreamLine(lineBuffer.trim());
      }

      if (code !== 0 && code !== null) {
        const authError = this.detectAuthError(stderr);
        const msg =
          authError ??
          (stderr.trim()
            ? `Process exited with code ${code}: ${stderr.trim()}`
            : `Process exited with code ${code}`);
        enqueue({ type: 'error', content: msg, timestamp: new Date() });
      }
      enqueue(null);
    });

    try {
      while (true) {
        await waitForItem();
        const item = queue.shift();
        if (item === null || item === undefined) {
          if (spawnError !== null) {
            yield {
              type: 'error' as const,
              content: (spawnError as Error).message,
              timestamp: new Date(),
            };
          }
          return;
        }
        yield item;
      }
    } finally {
      await preparedPrompt.cleanup();
    }
  }

  /**
   * Build CLI args for the copilot invocation.
   * Prompt is passed via -p flag (not stdin).
   */
  private buildArgs(prompt: string, options?: AgentExecutionOptions): string[] {
    const args = ['-p', prompt, ...BASE_FLAGS];

    if (options?.model) {
      args.push('--model', this.normalizeModel(options.model));
    }
    if (options?.resumeSession) args.push(`--resume=${options.resumeSession}`);

    // Unsupported options — log and ignore
    if (options?.allowedTools?.length) {
      this.log('allowedTools option is not supported by Copilot CLI — ignoring');
    }
    if (options?.systemPrompt) {
      this.log('systemPrompt option is not supported by Copilot CLI — ignoring');
    }
    if (options?.outputSchema) {
      this.log('outputSchema option is not supported by Copilot CLI — ignoring');
    }

    return args;
  }

  /**
   * Normalize legacy model names to the canonical Copilot CLI form.
   */
  private normalizeModel(model: string): string {
    const alias = LEGACY_MODEL_ALIASES[model];
    if (alias) {
      this.log(`Normalizing legacy model alias "${model}" to "${alias}"`);
      return alias;
    }

    // Generic fallback for legacy GPT names like gpt-5-2-codex -> gpt-5.2-codex.
    const genericGptAlias = model.replace(/^gpt-(\d+)-(\d+)(.*)$/i, 'gpt-$1.$2$3');
    if (genericGptAlias !== model) {
      this.log(`Normalizing legacy model alias "${model}" to "${genericGptAlias}"`);
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

  private buildSpawnOptions(options?: AgentExecutionOptions): Record<string, unknown> {
    const spawnOpts: Record<string, unknown> = {};
    if (options?.cwd) spawnOpts.cwd = options.cwd;

    // Explicitly pipe stdio so streams are available
    spawnOpts.stdio = ['pipe', 'pipe', 'pipe'];

    // On Windows: windowsHide=true to prevent blank console windows.
    // Copilot CLI is a Node.js binary, so shell=true is NOT needed.
    if (process.platform === 'win32') {
      spawnOpts.windowsHide = true;
    }

    // Strip CLAUDECODE env var to prevent "nested session" error when shep
    // is invoked from within a Claude Code session.
    const { CLAUDECODE: _, ...cleanEnv } = process.env;

    // Copilot CLI uses GitHub OAuth — no API key injection.
    spawnOpts.env = cleanEnv;

    return spawnOpts;
  }

  /**
   * Extract token usage from the Copilot CLI result event usage object.
   * Returns undefined if usage data is absent (does not throw).
   */
  private extractUsage(
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
  private detectAuthError(stderr: string): string | null {
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
}
