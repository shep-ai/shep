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
import { getCurrentPhase, getLogPrefix } from '../../feature-agent/log-context.js';

/** Features supported by Gemini CLI */
const SUPPORTED_FEATURES = new Set<string>(['session-resume', 'streaming', 'tool-scoping']);

/**
 * Executor service for Gemini CLI agent.
 * Uses subprocess spawning to interact with the `gemini` CLI.
 */
export class GeminiCliExecutorService implements IAgentExecutor {
  readonly agentType: AgentType = 'gemini-cli' as AgentType;

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
    const args = this.buildArgs(prompt, options, 'json');
    const spawnOpts = this.buildSpawnOptions(options);

    this.log(
      `Spawning: gemini ${args.map((a) => (a.length > 80 ? `${a.slice(0, 77)}...` : a)).join(' ')}`
    );
    this.log(`Spawn cwd: ${(spawnOpts.cwd as string) ?? '(inherited)'}`);

    const proc = this.spawn('gemini', args, spawnOpts);
    this.log(`Subprocess PID: ${proc.pid ?? 'undefined (spawn may have failed)'}`);
    this.log(`Prompt length: ${prompt.length} chars (piped via stdin)`);

    // Pipe the prompt via stdin to avoid ENAMETOOLONG on Windows.
    if (proc.stdin) {
      proc.stdin.write(prompt);
      proc.stdin.end();
    }

    return new Promise<AgentExecutionResult>((resolve, reject) => {
      let stdout = '';
      let stderr = '';
      let timedOut = false;
      let timeoutId: ReturnType<typeof setTimeout> | undefined;

      if (options?.timeout) {
        timeoutId = setTimeout(() => {
          timedOut = true;
          proc.kill();
        }, options.timeout);
      }

      proc.stdout?.on('data', (chunk: Buffer | string) => {
        stdout += chunk.toString();
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
              'Gemini CLI ("gemini") not found. Please install it: https://github.com/google-gemini/gemini-cli'
            )
          );
        } else {
          reject(error);
        }
      });

      proc.on('close', (code: number | null) => {
        this.log(`Process closed with code ${code}, stdout=${stdout.length} chars`);
        if (timeoutId) clearTimeout(timeoutId);

        if (timedOut) {
          reject(new Error('Agent execution timed out'));
          return;
        }

        if (code !== 0 && code !== null) {
          const message = stderr.trim()
            ? `Process exited with code ${code}: ${stderr.trim()}`
            : `Process exited with code ${code}`;
          reject(new Error(message));
          return;
        }

        // Gemini CLI may exit 0 despite fatal API errors (e.g. 429 rate limits).
        // Check stderr for known fatal patterns before trusting the output.
        const fatalError = this.detectFatalStderrError(stderr);
        if (fatalError) {
          reject(new Error(fatalError));
          return;
        }

        try {
          const parsed = JSON.parse(stdout);
          const result: AgentExecutionResult = { result: parsed.response ?? '' };

          if (parsed.session_id) result.sessionId = parsed.session_id;

          const usage = this.extractUsage(parsed);
          if (usage) result.usage = usage;

          resolve(result);
        } catch {
          reject(new Error(`Failed to parse Gemini JSON output: ${stdout.slice(0, 200)}`));
        }
      });
    });
  }

  async *executeStream(
    prompt: string,
    options?: AgentExecutionOptions
  ): AsyncIterable<AgentExecutionStreamEvent> {
    this.silent = options?.silent ?? false;
    const args = this.buildArgs(prompt, options, 'stream-json');
    const spawnOpts = this.buildSpawnOptions(options);
    const proc = this.spawn('gemini', args, spawnOpts);

    // Pipe the prompt via stdin to avoid ENAMETOOLONG on Windows.
    if (proc.stdin) {
      proc.stdin.write(prompt);
      proc.stdin.end();
    }

    let lineBuffer = '';
    let stderr = '';
    let timedOut = false;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    const queue: (AgentExecutionStreamEvent | null)[] = [];
    let resolve: (() => void) | null = null;
    let error: Error | null = null;

    function enqueue(event: AgentExecutionStreamEvent | null) {
      queue.push(event);
      if (resolve) {
        resolve();
        resolve = null;
      }
    }

    function waitForItem(): Promise<void> {
      if (queue.length > 0) return Promise.resolve();
      return new Promise<void>((r) => {
        resolve = r;
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

    proc.stdout?.on('data', (chunk: Buffer | string) => {
      lineBuffer += chunk.toString();
      const lines = lineBuffer.split('\n');
      lineBuffer = lines.pop() ?? '';
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        const event = this.parseStreamEvent(trimmed);
        if (event) enqueue(event);
      }
    });

    proc.stderr?.on('data', (chunk: Buffer | string) => {
      stderr += chunk.toString();
    });

    proc.on('error', (err: Error) => {
      if (timeoutId) clearTimeout(timeoutId);
      error = err;
      enqueue(null);
    });

    proc.on('close', (code: number | null) => {
      if (timeoutId) clearTimeout(timeoutId);
      if (timedOut) return; // already handled by timeout callback

      if (lineBuffer.trim()) {
        const event = this.parseStreamEvent(lineBuffer.trim());
        if (event) enqueue(event);
      }
      if (code !== 0 && code !== null) {
        const msg = stderr.trim()
          ? `Process exited with code ${code}: ${stderr.trim()}`
          : `Process exited with code ${code}`;
        enqueue({ type: 'error', content: msg, timestamp: new Date() });
      } else {
        // Gemini CLI may exit 0 despite fatal API errors (e.g. 429 rate limits)
        const fatalError = this.detectFatalStderrError(stderr);
        if (fatalError) {
          enqueue({ type: 'error', content: fatalError, timestamp: new Date() });
        }
      }
      enqueue(null);
    });

    while (true) {
      await waitForItem();
      const item = queue.shift();
      if (item === null || item === undefined) {
        if (error !== null) {
          yield {
            type: 'error' as const,
            content: (error as Error).message,
            timestamp: new Date(),
          };
        }
        return;
      }
      yield item;
    }
  }

  /**
   * Parse a single stream-JSON line into an AgentExecutionStreamEvent.
   * Returns null for events that should be skipped (init, user messages, unknown types).
   */
  private parseStreamEvent(line: string): AgentExecutionStreamEvent | null {
    try {
      const parsed = JSON.parse(line) as Record<string, unknown>;
      const type = parsed.type as string;

      switch (type) {
        case 'init':
          return null;
        case 'message':
          if (parsed.role === 'user') return null;
          if (parsed.role === 'assistant' && parsed.delta) {
            return {
              type: 'progress',
              content: (parsed.content as string) ?? '',
              timestamp: new Date(),
            };
          }
          return null;
        case 'tool_use':
          return {
            type: 'progress',
            content: `[tool_use: ${parsed.tool_name}]`,
            timestamp: new Date(),
          };
        case 'tool_result':
          return {
            type: 'progress',
            content: `[tool_result: ${parsed.status}]`,
            timestamp: new Date(),
          };
        case 'result':
          return {
            type: 'result',
            content: (parsed.response as string) ?? '',
            timestamp: new Date(),
          };
        case 'error':
          return {
            type: 'error',
            content: (parsed.message as string) ?? '',
            timestamp: new Date(),
          };
        default:
          return null;
      }
    } catch {
      // Non-JSON line — emit as raw progress
      return { type: 'progress', content: line, timestamp: new Date() };
    }
  }

  /**
   * Patterns in stderr that indicate a fatal API error even when exit code is 0.
   * Gemini CLI sometimes exits 0 after exhausting retries on 429/5xx errors.
   */
  private static readonly FATAL_STDERR_PATTERNS = [
    /RESOURCE_EXHAUSTED/i,
    /failed with status 4\d{2}\. Retrying/i,
    /failed with status 5\d{2}\. Retrying/i,
  ];

  /**
   * Check stderr for patterns indicating fatal API errors.
   * Returns an error message if fatal patterns are found, null otherwise.
   */
  private detectFatalStderrError(stderr: string): string | null {
    for (const pattern of GeminiCliExecutorService.FATAL_STDERR_PATTERNS) {
      if (pattern.test(stderr)) {
        // Extract a concise summary from the noisy stderr
        const lines = stderr.split('\n').filter((l) => l.trim());
        const summary = lines.slice(0, 3).join(' | ').slice(0, 300);
        return `Gemini CLI exited 0 but fatal error detected in stderr: ${summary}`;
      }
    }
    return null;
  }

  /**
   * Extract token usage from Gemini stats structure.
   * Returns undefined if stats are missing (does not throw).
   */
  private extractUsage(
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

  private buildArgs(
    _prompt: string,
    options?: AgentExecutionOptions,
    outputFormat = 'json'
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
      this.log('systemPrompt option is not supported by Gemini CLI — ignoring');
    }
    if (options?.outputSchema) {
      this.log('outputSchema option is not supported by Gemini CLI — ignoring');
    }

    return args;
  }

  private buildSpawnOptions(options?: AgentExecutionOptions): Record<string, unknown> {
    const spawnOpts: Record<string, unknown> = {};
    if (options?.cwd) spawnOpts.cwd = options.cwd;

    // Explicitly pipe stdio so streams are available even when parent disconnects
    spawnOpts.stdio = ['pipe', 'pipe', 'pipe'];

    // On Windows: windowsHide=true to prevent blank console windows.
    // Gemini CLI is a native binary, so shell=true is NOT needed.
    if (process.platform === 'win32') {
      spawnOpts.windowsHide = true;
    }

    // Strip CLAUDECODE env var to prevent "nested session" error when shep
    // is invoked from within a Claude Code session.
    const { CLAUDECODE: _, ...cleanEnv } = process.env;

    // Auto-trust the workspace. Recent gemini-cli versions exit (code 55) in
    // headless mode when the cwd isn't on the user's trusted-folders list,
    // even with -y (YOLO) — the trust check overrides YOLO. shep always runs
    // gemini against worktrees we just created, so the trust prompt is moot.
    const baseEnv = { ...cleanEnv, GEMINI_CLI_TRUST_WORKSPACE: 'true' };

    // Inject GEMINI_API_KEY when using token auth
    if (this.authConfig?.authMethod === 'token' && this.authConfig.token) {
      spawnOpts.env = { ...baseEnv, GEMINI_API_KEY: this.authConfig.token };
    } else {
      spawnOpts.env = baseEnv;
    }

    return spawnOpts;
  }
}
