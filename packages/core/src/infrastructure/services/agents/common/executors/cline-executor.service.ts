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
import { getCurrentPhase, getLogPrefix } from '../../feature-agent/log-context.js';

/** Features supported by Cline CLI */
const SUPPORTED_FEATURES = new Set<string>(['streaming', 'system-prompt']);

/**
 * Executor service for the Cline agentic coding assistant.
 * Uses subprocess spawning to interact with the `cline` CLI in headless mode.
 */
export class ClineExecutorService implements IAgentExecutor {
  readonly agentType: AgentType = 'cline' as AgentType;

  /** When true, suppresses debug logging (set per-call via options.silent) */
  private silent = false;

  constructor(private readonly spawn: SpawnFunction) {}

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
    const args = this.buildArgs(prompt, options);
    const spawnOpts = this.buildSpawnOptions(options);

    this.log(
      `Spawning: cline ${args.map((a) => (a.length > 80 ? `${a.slice(0, 77)}...` : a)).join(' ')}`
    );
    this.log(`Spawn cwd: ${(spawnOpts.cwd as string) ?? '(inherited)'}`);

    const proc = this.spawn('cline', args, spawnOpts);

    this.log(`Subprocess PID: ${proc.pid ?? 'undefined (spawn may have failed)'}`);
    this.log(`Prompt length: ${prompt.length} chars`);

    return new Promise<AgentExecutionResult>((resolve, reject) => {
      let lineBuffer = '';
      let stderr = '';
      let timedOut = false;
      let timeoutId: ReturnType<typeof setTimeout> | undefined;

      // Accumulated result text from JSON events
      let resultText = '';

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
          // Cline JSON output has { type: "say"|"ask", text: "...", ts: ..., partial: bool }
          if (parsed.type === 'say' && typeof parsed.text === 'string' && !parsed.partial) {
            resultText += parsed.text;
          }
        } catch {
          // Non-JSON line — accumulate as raw text
          if (line.trim()) {
            resultText += line;
          }
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
            new Error('Cline CLI ("cline") not found. Please install it: npm install -g cline')
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

        if (timedOut) {
          reject(new Error('Agent execution timed out'));
          return;
        }

        if (code !== 0 && code !== null) {
          reject(new Error(stderr.trim() || `Process exited with code ${code}`));
          return;
        }

        resolve({ result: resultText });
      });
    });
  }

  async *executeStream(
    prompt: string,
    options?: AgentExecutionOptions
  ): AsyncIterable<AgentExecutionStreamEvent> {
    this.silent = options?.silent ?? false;
    const args = this.buildArgs(prompt, options);
    const spawnOpts = this.buildSpawnOptions(options);
    const proc = this.spawn('cline', args, spawnOpts);

    let lineBuffer = '';
    let stderr = '';

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
      enqueue(null);
    });

    proc.on('close', (code: number | null) => {
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
   * Log a Cline JSON line as a human-readable event in the worker log.
   */
  private logStreamEvent(line: string): void {
    try {
      const parsed = JSON.parse(line);
      if (parsed.type === 'say' && parsed.text) {
        const preview = parsed.text.length > 200 ? `${parsed.text.slice(0, 197)}...` : parsed.text;
        this.log(`[text] ${preview.replace(/\n/g, ' ')}`);
        return;
      }
      if (parsed.type === 'ask') {
        this.log(`[ask] ${(parsed.text ?? '').slice(0, 200).replace(/\n/g, ' ')}`);
        return;
      }
    } catch {
      if (line.length > 0) {
        this.log(`[raw] ${line}`);
      }
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
    if (options?.timeout) args.push('--timeout', String(Math.ceil(options.timeout / 1000)));

    // The prompt is the last positional argument
    args.push(prompt);

    return args;
  }

  private buildSpawnOptions(options?: AgentExecutionOptions): Record<string, unknown> {
    const spawnOpts: Record<string, unknown> = {};
    if (options?.cwd) spawnOpts.cwd = options.cwd;

    // Explicitly pipe stdio so streams are available even when parent disconnects
    spawnOpts.stdio = ['pipe', 'pipe', 'pipe'];

    if (process.platform === 'win32') {
      spawnOpts.windowsHide = true;
    }

    // Strip CLAUDECODE env var to prevent nested session errors
    const { CLAUDECODE: _, ...cleanEnv } = process.env;
    spawnOpts.env = cleanEnv;

    return spawnOpts;
  }

  private parseStreamLine(line: string): AgentExecutionStreamEvent | null {
    try {
      const parsed = JSON.parse(line);

      // Cline JSON format: { type: "say"|"ask", text: "...", ts: ..., partial: bool }
      if (parsed.type === 'say' && typeof parsed.text === 'string') {
        if (parsed.partial) {
          return {
            type: 'progress',
            content: parsed.text,
            timestamp: new Date(),
          };
        }
        return {
          type: 'result',
          content: parsed.text,
          timestamp: new Date(),
        };
      }

      if (parsed.type === 'ask') {
        return {
          type: 'progress',
          content: parsed.text ?? '',
          timestamp: new Date(),
        };
      }

      if (parsed.type === 'error') {
        return {
          type: 'error',
          content: parsed.text ?? parsed.message ?? '',
          timestamp: new Date(),
        };
      }

      // Generic content
      if (parsed.text || parsed.message) {
        const rawContent = parsed.text ?? parsed.message;
        const content = typeof rawContent === 'string' ? rawContent : JSON.stringify(rawContent);
        return {
          type: 'progress',
          content,
          timestamp: new Date(),
        };
      }

      return null;
    } catch {
      return {
        type: 'progress',
        content: line,
        timestamp: new Date(),
      };
    }
  }
}
