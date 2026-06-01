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
import { execFileSync } from 'node:child_process';
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
import { getCurrentPhase, getLogPrefix } from '../../feature-agent/log-context.js';
import { IS_WINDOWS } from '../../../../platform.js';

/**
 * Map canonical model IDs (used across shep) to Cursor CLI model names.
 * Cursor uses short names like "sonnet-4.6" instead of "claude-sonnet-4-6".
 * Models that already match Cursor's naming pass through unchanged.
 */
const CURSOR_MODEL_MAP: Record<string, string> = {
  'claude-opus-4-8': 'opus-4.8',
  'claude-opus-4-7': 'opus-4.7',
  'claude-opus-4-6': 'opus-4.6',
  'claude-sonnet-4-6': 'sonnet-4.6',
  'claude-haiku-4-5': 'haiku-4.5',
  'grok-code': 'grok',
};

function toCursorModelName(model: string): string {
  return CURSOR_MODEL_MAP[model] ?? model;
}

/** Features supported by Cursor CLI */
const SUPPORTED_FEATURES = new Set<string>(['session-resume', 'streaming']);

/**
 * Executor service for Cursor agent.
 * Uses subprocess spawning to interact with the `cursor-agent` CLI.
 */
export class CursorExecutorService implements IAgentExecutor {
  readonly agentType: AgentType = 'cursor' as AgentType;

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
    // Use json (not stream-json) for execute() — outputs a single JSON result line.
    // stream-json is unreliable on Windows where shell: true can mangle args.
    const args = this.buildArgs(prompt, options);

    const { proc, tmpFile } = this.spawnAgent(prompt, args, options);

    return new Promise<AgentExecutionResult>((resolve, reject) => {
      let lineBuffer = '';
      let stderr = '';
      let timedOut = false;
      let timeoutId: ReturnType<typeof setTimeout> | undefined;

      // Accumulated from JSON events or raw text fallback
      let resultText = '';
      let rawText = '';
      let sessionId: string | undefined;
      let metadata: Record<string, unknown> | undefined;

      if (options?.timeout) {
        timeoutId = setTimeout(() => {
          timedOut = true;
          // On Windows, proc.kill() may not kill the entire process tree
          // (PowerShell + child agent process). Use taskkill /T for tree kill.
          if (process.platform === 'win32' && proc.pid) {
            try {
              execFileSync('taskkill', ['/F', '/T', '/PID', String(proc.pid)], {
                stdio: 'ignore',
              });
            } catch {
              proc.kill();
            }
          } else {
            proc.kill();
          }
        }, options.timeout);
      }

      const processLine = (line: string) => {
        this.logStreamEvent(line);
        try {
          const parsed = JSON.parse(line);
          if (parsed.type === 'assistant' && Array.isArray(parsed.message?.content)) {
            for (const block of parsed.message.content) {
              if (block.type === 'text' && block.text) resultText += block.text;
            }
          } else if (parsed.type === 'result') {
            // json format puts the full result text in parsed.result
            if (typeof parsed.result === 'string' && parsed.result) resultText = parsed.result;
            if (parsed.session_id) sessionId = parsed.session_id;
            if (parsed.duration_ms !== undefined) {
              metadata = { ...metadata, duration_ms: parsed.duration_ms };
            }
          }
          // user, system, thinking events: logged but don't affect result
        } catch {
          // Non-JSON output — accumulate as raw text fallback
          if (line.length > 0) rawText += `${line}\n`;
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

        // Detect fatal errors early so callers don't waste time retrying
        if (data.includes('Cannot use this model')) {
          if (timeoutId) clearTimeout(timeoutId);
          proc.kill();
          reject(new Error(data.trim()));
        }
      });

      proc.on('error', (error: Error & { code?: string }) => {
        this.log(`Process error event: ${error.message}`);
        if (timeoutId) clearTimeout(timeoutId);
        if (error.code === 'ENOENT') {
          reject(
            new Error(
              'Cursor agent CLI not found. Please install Cursor and ensure the "cursor" command is available on PATH.'
            )
          );
        } else {
          reject(error);
        }
      });

      proc.on('close', (code: number | null) => {
        // Clean up temp file on Windows
        if (tmpFile) {
          try {
            unlinkSync(tmpFile);
          } catch {
            /* already removed or inaccessible */
          }
        }
        if (lineBuffer.trim()) processLine(lineBuffer.trim());
        // Use raw text as fallback when no JSON result was captured
        const finalText = resultText || rawText.trim();
        this.log(`Process closed with code ${code}, result=${finalText.length} chars`);
        if (timeoutId) clearTimeout(timeoutId);

        if (timedOut) {
          reject(new Error('Agent execution timed out'));
          return;
        }

        if (code !== 0 && code !== null) {
          reject(new Error(stderr.trim() || `Process exited with code ${code}`));
          return;
        }

        const result: AgentExecutionResult = { result: finalText };
        if (sessionId) result.sessionId = sessionId;
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
    const { proc, tmpFile } = this.spawnAgent(prompt, args, options);

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
        if (event) enqueue(event);
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
      if (tmpFile) {
        try {
          unlinkSync(tmpFile);
        } catch {
          /* already removed */
        }
      }
      if (lineBuffer.trim()) {
        const event = this.parseStreamLine(lineBuffer.trim());
        if (event) enqueue(event);
      }
      if (code !== 0 && code !== null && stderr.trim()) {
        enqueue({ type: 'error', content: stderr.trim(), timestamp: new Date() });
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
   * Log a stream-json line as a human-readable event in the worker log.
   */
  private logStreamEvent(line: string): void {
    try {
      const parsed = JSON.parse(line);

      if (parsed.type === 'assistant' && Array.isArray(parsed.message?.content)) {
        for (const block of parsed.message.content) {
          if (block.type === 'text' && block.text?.trim()) {
            this.log(`[text] ${block.text.trim().replace(/\n/g, ' ')}`);
          }
        }
        return;
      }

      if (parsed.type === 'tool_call') {
        const toolName =
          Object.keys(parsed).find((k) => k.endsWith('ToolCall') || k.endsWith('toolCall')) ??
          'unknown';
        this.log(`[tool] ${parsed.subtype ?? 'call'}: ${toolName}`);
        return;
      }

      if (parsed.type === 'result') {
        this.log(
          `[result] session=${parsed.session_id ?? 'none'}, duration=${parsed.duration_ms ?? 'unknown'}ms`
        );
        return;
      }

      if (parsed.type === 'user') return; // Skip echoed input
    } catch {
      if (line.length > 0) this.log(`[raw] ${line}`);
    }
  }

  private buildArgs(prompt: string, options?: AgentExecutionOptions): string[] {
    const args = ['--yolo', '-p', prompt, '--output-format', 'json'];
    if (options?.resumeSession) args.push('--resume', options.resumeSession);
    if (options?.model) args.push('--model', toCursorModelName(options.model));
    // Unsupported options silently omitted: systemPrompt, allowedTools, maxTurns, outputSchema
    // No auth flags — binary handles its own auth
    return args;
  }

  private buildStreamArgs(prompt: string, options?: AgentExecutionOptions): string[] {
    const args = this.buildArgs(prompt, options);
    const fmtIdx = args.indexOf('--output-format');
    if (fmtIdx !== -1) args[fmtIdx + 1] = 'stream-json';
    return args;
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
   * On Linux/macOS, spawn `cursor-agent` directly — no shell needed.
   */
  private spawnAgent(
    prompt: string,
    args: string[],
    options?: AgentExecutionOptions
  ): { proc: ReturnType<SpawnFunction>; tmpFile: string | undefined } {
    const { CLAUDECODE: _, ...cleanEnv } = process.env;
    const cwd = options?.cwd;

    if (IS_WINDOWS) {
      // Write prompt to temp file to bypass cmd.exe argument mangling
      const tmpFile = join(
        tmpdir(),
        `shep-cursor-${Date.now()}-${Math.random().toString(36).slice(2, 6)}.txt`
      );
      writeFileSync(tmpFile, prompt, 'utf8');

      // Build the agent args WITHOUT -p and the prompt (they go via temp file)
      const agentFlags = args.filter((a) => a !== '-p' && a !== prompt).join(' ');
      const safePath = tmpFile.replace(/'/g, "''");
      const psCmd = `$p = Get-Content -Raw '${safePath}'; & cursor-agent ${agentFlags} -p $p`;

      this.log(`Windows PowerShell mode: wrote ${prompt.length} chars to ${tmpFile}`);
      this.log(`PS command: ${psCmd.replace(prompt, `<${prompt.length} chars>`)}`);

      const proc = this.spawn(
        'powershell.exe',
        ['-NoProfile', '-NonInteractive', '-Command', psCmd],
        {
          cwd,
          stdio: ['pipe', 'pipe', 'pipe'],
          windowsHide: true,
          env: cleanEnv,
        }
      );
      this.log(`PowerShell PID: ${proc.pid ?? 'undefined (spawn may have failed)'}`);
      if (proc.stdin) proc.stdin.end();

      return { proc, tmpFile };
    }

    // Linux/macOS: spawn agent directly, no shell needed
    const spawnOpts: Record<string, unknown> = {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: cleanEnv,
    };
    if (cwd) spawnOpts.cwd = cwd;

    this.log(
      `Spawning: cursor-agent ${args.map((a) => (a.length > 80 ? `${a.slice(0, 77)}...` : a)).join(' ')}`
    );
    this.log(`Spawn cwd: ${(cwd as string) ?? '(inherited)'}`);

    const proc = this.spawn('cursor-agent', args, spawnOpts);
    this.log(`Subprocess PID: ${proc.pid ?? 'undefined (spawn may have failed)'}`);
    if (proc.stdin) proc.stdin.end();

    return { proc, tmpFile: undefined };
  }

  private parseStreamLine(line: string): AgentExecutionStreamEvent | null {
    try {
      const parsed = JSON.parse(line);

      if (parsed.type === 'assistant' && Array.isArray(parsed.message?.content)) {
        const textParts: string[] = [];
        for (const block of parsed.message.content) {
          if (block.type === 'text' && block.text) textParts.push(block.text);
        }
        if (textParts.length > 0) {
          return { type: 'progress', content: textParts.join(''), timestamp: new Date() };
        }
        return null;
      }

      if (parsed.type === 'tool_call' && parsed.subtype === 'completed') {
        const toolName =
          Object.keys(parsed).find((k) => k.endsWith('ToolCall') || k.endsWith('toolCall')) ??
          'tool';
        return { type: 'progress', content: `Tool completed: ${toolName}`, timestamp: new Date() };
      }

      if (parsed.type === 'tool_call' && parsed.subtype === 'started') {
        const toolName =
          Object.keys(parsed).find((k) => k.endsWith('ToolCall') || k.endsWith('toolCall')) ??
          'tool';
        return { type: 'progress', content: `Tool started: ${toolName}`, timestamp: new Date() };
      }

      if (parsed.type === 'result') {
        return { type: 'result', content: parsed.session_id ?? '', timestamp: new Date() };
      }

      if (parsed.type === 'user') return null; // Skip echoed input

      if (parsed.type === 'error') {
        return {
          type: 'error',
          content: parsed.error ?? parsed.message ?? '',
          timestamp: new Date(),
        };
      }

      return null;
    } catch {
      return { type: 'progress', content: line, timestamp: new Date() };
    }
  }
}
