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
import { getCurrentPhase, getLogPrefix } from '../../feature-agent/log-context.js';
import { IS_WINDOWS } from '../../../../platform.js';

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

/**
 * Executor service for Claude Code agent.
 * Uses subprocess spawning to interact with the `claude` CLI.
 */
export class ClaudeCodeExecutorService implements IAgentExecutor {
  readonly agentType: AgentType = 'claude-code' as AgentType;

  /** When true, suppresses debug logging (set per-call via options.silent) */
  private silent = false;

  constructor(private readonly spawn: SpawnFunction) {}

  /** Debug logging — writes to stdout so it appears in the worker log file */
  private log(message: string): void {
    if (this.silent) return;
    const ts = new Date().toISOString();
    process.stdout.write(`[${ts}] ${getCurrentPhase()}${getLogPrefix()}${message}\n`);
  }

  async execute(prompt: string, options?: AgentExecutionOptions): Promise<AgentExecutionResult> {
    this.silent = options?.silent ?? false;
    // Use stream-json so we get real-time events in the worker log
    // instead of zero output for minutes with --output-format json
    const args = this.buildStreamArgs(prompt, options);
    const spawnOpts = this.buildSpawnOptions(options);

    this.log(
      `Spawning: claude ${args.map((a) => (a.length > 80 ? `${a.slice(0, 77)}...` : a)).join(' ')}`
    );
    this.log(`Spawn cwd: ${(spawnOpts.cwd as string) ?? '(inherited)'}`);

    const proc = this.spawn('claude', args, spawnOpts);

    this.log(`Subprocess PID: ${proc.pid ?? 'undefined (spawn may have failed)'}`);
    this.log(`Prompt length: ${prompt.length} chars (piped via stdin)`);

    // Pipe the prompt via stdin to avoid ENAMETOOLONG on Windows.
    if (proc.stdin) {
      proc.stdin.write(prompt);
      proc.stdin.end();
    }

    return new Promise<AgentExecutionResult>((resolve, reject) => {
      // Line-based parsing: only keep the data we need, not all of stdout
      let lineBuffer = '';
      let stderr = '';
      let timedOut = false;
      let timeoutId: ReturnType<typeof setTimeout> | undefined;
      let postResultKillTimer: ReturnType<typeof setTimeout> | undefined;

      // Collected from the stream — only the final result line matters
      let resultText = '';
      let sessionId: string | undefined;
      let usage: { inputTokens: number; outputTokens: number } | undefined;
      let metadata: Record<string, unknown> | undefined;

      if (options?.timeout) {
        timeoutId = setTimeout(() => {
          timedOut = true;
          proc.kill();
        }, options.timeout);
      }

      const processLine = (line: string) => {
        this.logStreamEvent(line);
        try {
          const parsed = JSON.parse(line);
          if (parsed.type === 'result') {
            resultText = parsed.result ?? '';
            if (parsed.session_id) sessionId = parsed.session_id;
            usage = this.extractUsage(parsed);

            const { type: _t, result: _r, session_id: _s, usage: _u, ...rest } = parsed;
            if (Object.keys(rest).length > 0) metadata = rest;

            // The CLI emitted its final result. Give it a grace period to tear
            // down MCP servers and exit on its own; if it still hasn't closed,
            // send SIGKILL so the close handler runs and we resolve. Without
            // this, leaked MCP/background children (issue: feature 92701aa8
            // hung 3+ hours after [result]) trap the worker forever.
            postResultKillTimer ??= setTimeout(() => {
              this.log(
                `Subprocess did not exit within ${RESULT_TO_CLOSE_GRACE_MS / 1000}s of [result] — sending SIGKILL`
              );
              try {
                proc.kill('SIGKILL');
              } catch {
                /* already dead — close handler will resolve */
              }
            }, RESULT_TO_CLOSE_GRACE_MS);
          }
        } catch {
          /* not JSON — already logged by logStreamEvent */
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
              'Claude Code CLI ("claude") not found. Please install it: https://docs.anthropic.com/en/docs/agents-and-tools/claude-code/overview'
            )
          );
        } else {
          reject(error);
        }
      });

      proc.on('close', (code: number | null) => {
        // Flush remaining buffer
        if (lineBuffer.trim()) processLine(lineBuffer.trim());

        this.log(`Process closed with code ${code}, result=${resultText.length} chars`);
        if (timeoutId) clearTimeout(timeoutId);
        if (postResultKillTimer) clearTimeout(postResultKillTimer);

        if (timedOut) {
          reject(new Error('Agent execution timed out'));
          return;
        }

        if (code !== 0 && code !== null) {
          reject(new Error(stderr.trim() || `Process exited with code ${code}`));
          return;
        }

        const result: AgentExecutionResult = { result: resultText };
        if (sessionId) result.sessionId = sessionId;
        if (usage) result.usage = usage;
        if (metadata) result.metadata = metadata;
        resolve(result);
      });
    });
  }

  async *executeStream(
    prompt: string,
    options?: AgentExecutionOptions
  ): AsyncIterable<AgentExecutionStreamEvent> {
    const args = this.buildStreamArgs(prompt, options);
    const spawnOpts = this.buildSpawnOptions(options);
    const proc = this.spawn('claude', args, spawnOpts);

    // Pipe the prompt via stdin to avoid ENAMETOOLONG on Windows.
    if (proc.stdin) {
      proc.stdin.write(prompt);
      proc.stdin.end();
    }

    // Buffer for incomplete lines
    let lineBuffer = '';
    let stderr = '';

    // Create an async queue to bridge event-based IO to async iteration
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

    proc.stdout?.on('data', (chunk: Buffer | string) => {
      lineBuffer += chunk.toString();
      const lines = lineBuffer.split('\n');
      // Keep the last partial line in the buffer
      lineBuffer = lines.pop() ?? '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        const event = this.parseStreamLine(trimmed);
        if (event) {
          enqueue(event);
        }
      }
    });

    proc.stderr?.on('data', (chunk: Buffer | string) => {
      stderr += chunk.toString();
    });

    proc.on('error', (err: Error) => {
      error = err;
      enqueue(null); // signal end
    });

    proc.on('close', (code: number | null) => {
      // Process any remaining data in the buffer
      if (lineBuffer.trim()) {
        const event = this.parseStreamLine(lineBuffer.trim());
        if (event) enqueue(event);
      }

      if (code !== 0 && code !== null && stderr.trim()) {
        enqueue({
          type: 'error',
          content: stderr.trim(),
          timestamp: new Date(),
        });
      }
      enqueue(null); // signal end
    });

    // Yield events as they arrive
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
   * Log a stream-json line as a human-readable event in the worker log.
   * Extracts tool calls, assistant text, and result summaries.
   */
  private logStreamEvent(line: string): void {
    try {
      const parsed = JSON.parse(line);

      // Assistant messages contain tool_use and text blocks
      if (parsed.type === 'assistant' && Array.isArray(parsed.message?.content)) {
        for (const block of parsed.message.content) {
          if (block.type === 'tool_use') {
            const inputJson = JSON.stringify(block.input ?? {});
            this.log(`[tool] ${block.name} ${inputJson}`);
          } else if (block.type === 'text' && block.text?.trim()) {
            this.log(`[text] ${block.text.trim().replace(/\n/g, ' ')}`);
          }
        }
        return;
      }

      // Final result — summary with session and token info
      if (parsed.type === 'result') {
        this.log(
          `[result] ${(parsed.result ?? '').length} chars, session=${parsed.session_id ?? 'none'}`
        );
        const u = parsed.usage;
        if (u) {
          const inTokens =
            (u.input_tokens ?? 0) +
            (u.cache_creation_input_tokens ?? 0) +
            (u.cache_read_input_tokens ?? 0);
          const costStr =
            parsed.total_cost_usd != null ? `, $${Number(parsed.total_cost_usd).toFixed(4)}` : '';
          this.log(`[tokens] ${inTokens} in / ${u.output_tokens ?? 0} out${costStr}`);
        }
        return;
      }
    } catch {
      // Non-JSON line — log it raw
      if (line.length > 0) {
        this.log(`[raw] ${line}`);
      }
    }
  }

  supportsFeature(feature: AgentFeature): boolean {
    return SUPPORTED_FEATURES.has(feature as string);
  }

  private buildArgs(_prompt: string, options?: AgentExecutionOptions): string[] {
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
    if (options?.tools?.length) args.push('--tools', options.tools.join(','));
    return args;
  }

  private buildStreamArgs(prompt: string, options?: AgentExecutionOptions): string[] {
    const args = this.buildArgs(prompt, options);
    const fmtIdx = args.indexOf('--output-format');
    if (fmtIdx !== -1) args[fmtIdx + 1] = 'stream-json';
    // stream-json requires --verbose and --include-partial-messages when using -p (--print)
    // --no-chrome ensures it runs in non-interactive mode without browser integration
    args.push('--verbose', '--include-partial-messages', '--no-chrome');
    return args;
  }

  private buildSpawnOptions(options?: AgentExecutionOptions): Record<string, unknown> {
    const spawnOpts: Record<string, unknown> = {};
    if (options?.cwd) spawnOpts.cwd = options.cwd;

    // Explicitly pipe stdio so streams are available even when parent disconnects
    spawnOpts.stdio = ['pipe', 'pipe', 'pipe'];

    // On Windows: windowsHide=true to prevent blank console windows.
    // Do NOT use shell=true — it causes DEP0190 argument escaping issues
    // and mangles prompts with special characters. The claude CLI is a
    // native .exe, so spawn() finds it on PATH without shell.
    if (IS_WINDOWS) {
      spawnOpts.windowsHide = true;
    }

    // Strip CLAUDECODE env var to prevent "nested session" error when shep
    // is invoked from within a Claude Code session. The claude CLI checks for
    // this variable and refuses to start if it's set.

    const { CLAUDECODE: _, ...cleanEnv } = process.env;
    spawnOpts.env = cleanEnv;

    return spawnOpts;
  }

  private parseJsonResult(stdout: string): AgentExecutionResult {
    const trimmed = stdout.trim();

    try {
      const parsed = JSON.parse(trimmed);
      const result: AgentExecutionResult = {
        result: parsed.result ?? trimmed,
      };

      if (parsed.session_id) {
        result.sessionId = parsed.session_id;
      }

      const usage = this.extractUsage(parsed);
      if (usage) result.usage = usage;

      // Store additional metadata
      const { result: _r, session_id: _s, usage: _u, ...rest } = parsed;
      if (Object.keys(rest).length > 0) {
        result.metadata = rest;
      }

      return result;
    } catch {
      // If stdout is not valid JSON, treat it as raw text result
      return { result: trimmed };
    }
  }

  /**
   * Extract token usage and execution stats from a Claude Code CLI result object.
   * Tokens live inside `parsed.usage`; cost/turns/apiDuration at the top level.
   */
  private extractUsage(parsed: Record<string, unknown>): AgentExecutionUsage | undefined {
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

  private parseStreamLine(line: string): AgentExecutionStreamEvent | null {
    try {
      const parsed = JSON.parse(line);

      // Handle Claude Code stream_json format with nested events
      if (parsed.type === 'stream_event' && parsed.event) {
        const { event } = parsed;

        // Extract text deltas for progress
        if (event.type === 'content_block_delta' && event.delta?.text) {
          return {
            type: 'progress',
            content: event.delta.text,
            timestamp: new Date(),
          };
        }

        // Message complete - ignore for now (accumulated text is in progress events)
        if (event.type === 'message_stop') {
          return null;
        }
      }

      // Ignore assistant messages - we already get all text via content_block_delta events
      if (parsed.type === 'assistant') {
        return null;
      }

      // Handle legacy format (backward compatibility)
      if (parsed.type === 'result') {
        return {
          type: 'result',
          content: parsed.result ?? '',
          timestamp: new Date(),
        };
      }

      if (parsed.type === 'error') {
        return {
          type: 'error',
          content: parsed.error ?? parsed.message ?? '',
          timestamp: new Date(),
        };
      }

      // Generic progress for other event types (ensure content is a string)
      if (parsed.content || parsed.message) {
        const rawContent = parsed.content ?? parsed.message;
        const content = typeof rawContent === 'string' ? rawContent : JSON.stringify(rawContent);
        return {
          type: 'progress',
          content,
          timestamp: new Date(),
        };
      }

      return null;
    } catch {
      // Non-JSON line, treat as progress text
      return {
        type: 'progress',
        content: line,
        timestamp: new Date(),
      };
    }
  }
}
