/**
 * CodexCliExecutorService Unit Tests
 *
 * Tests for the OpenAI Codex CLI subprocess executor service.
 * Uses constructor-injected spawn function mock (NOT vi.mock of child_process).
 *
 * TDD Phase: RED-GREEN
 */

import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import * as fs from 'node:fs';
import { CodexCliExecutorService } from '@/infrastructure/services/agents/common/executors/codex-cli-executor.service.js';
import type { SpawnFunction } from '@/infrastructure/services/agents/common/types.js';
import { AgentType, AgentFeature, SecurityMode } from '@/domain/generated/output.js';
import { SecurityViolationError } from '@/domain/errors/security-violation.error.js';
import { strictConstraints } from './security-constraints.fixture.js';
import type { AgentConfig } from '@/domain/generated/output.js';

/**
 * Creates a mock ChildProcess-like object that can emit events and provide
 * stdout/stderr streams for testing subprocess interactions.
 */
function createMockChildProcess() {
  const stdin = new PassThrough();
  const stdout = new PassThrough();
  const stderr = new PassThrough();
  const proc = new EventEmitter() as EventEmitter & {
    stdin: PassThrough;
    stdout: PassThrough;
    stderr: PassThrough;
    pid: number;
    kill: ReturnType<typeof vi.fn>;
  };
  proc.stdin = stdin;
  proc.stdout = stdout;
  proc.stderr = stderr;
  proc.pid = 12345;
  proc.kill = vi.fn();
  return proc;
}

/** Build a Codex JSONL thread.started event */
function threadStarted(threadId: string): string {
  return JSON.stringify({ type: 'thread.started', thread_id: threadId });
}

/** Build a Codex JSONL item.completed agent_message event */
function agentMessageCompleted(text: string): string {
  return JSON.stringify({
    type: 'item.completed',
    item: { type: 'agent_message', content: [{ type: 'text', text }] },
  });
}

/** Build a Codex JSONL turn.completed event */
function turnCompleted(usage?: { input_tokens: number; output_tokens: number }): string {
  return JSON.stringify({ type: 'turn.completed', ...(usage ? { usage } : {}) });
}

/** Build a Codex JSONL item.started event */
function itemStarted(itemType: string, extra?: Record<string, unknown>): string {
  return JSON.stringify({
    type: 'item.started',
    item: { type: itemType, ...extra },
  });
}

/** Build a Codex JSONL item.updated event */
function itemUpdated(itemType: string, content: unknown): string {
  return JSON.stringify({
    type: 'item.updated',
    item: { type: itemType, content },
  });
}

/** Build a Codex JSONL item.completed event for commands/files */
function itemCompleted(itemType: string, extra?: Record<string, unknown>): string {
  return JSON.stringify({
    type: 'item.completed',
    item: { type: itemType, ...extra },
  });
}

/** Emit JSONL lines on stdout then close the process */
function emitJsonlLines(
  proc: ReturnType<typeof createMockChildProcess>,
  lines: string[],
  stderrData: string | null,
  exitCode: number | null
) {
  process.nextTick(() => {
    for (const line of lines) {
      proc.stdout.write(`${line}\n`);
    }
    proc.stdout.end();
    if (stderrData !== null) proc.stderr.write(stderrData);
    proc.stderr.end();
    proc.emit('close', exitCode);
  });
}

describe('CodexCliExecutorService', () => {
  let mockSpawn: SpawnFunction;
  let executor: CodexCliExecutorService;

  beforeEach(() => {
    mockSpawn = vi.fn();
    executor = new CodexCliExecutorService(mockSpawn);
  });

  // A fake-timer test that fails before its own `useRealTimers()` must not
  // leave every later test waiting on timers that never advance.
  afterEach(() => {
    vi.useRealTimers();
  });

  // --- Task 2: Scaffold, agentType, supportsFeature ---

  describe('agentType', () => {
    it('should have agentType of CodexCli', () => {
      expect(executor.agentType).toBe(AgentType.CodexCli);
    });
  });

  describe('supportsFeature', () => {
    it('should support session-resume feature', () => {
      expect(executor.supportsFeature(AgentFeature.sessionResume)).toBe(true);
    });

    it('should support streaming feature', () => {
      expect(executor.supportsFeature(AgentFeature.streaming)).toBe(true);
    });

    it('should support structured-output feature', () => {
      expect(executor.supportsFeature(AgentFeature.structuredOutput)).toBe(true);
    });

    it('should NOT support system-prompt feature', () => {
      expect(executor.supportsFeature(AgentFeature.systemPrompt)).toBe(false);
    });

    it('should NOT support tool-scoping feature', () => {
      expect(executor.supportsFeature(AgentFeature.toolScoping)).toBe(false);
    });

    it('should support session-listing feature', () => {
      expect(executor.supportsFeature(AgentFeature.sessionListing)).toBe(true);
    });
  });

  // --- Task 3: execute() with basic prompt execution and JSONL parsing ---

  describe('execute', () => {
    it('should spawn codex with correct base args', async () => {
      const mockProc = createMockChildProcess();
      vi.mocked(mockSpawn).mockReturnValue(mockProc as any);

      const executePromise = executor.execute('Analyze this', { silent: true });
      emitJsonlLines(
        mockProc,
        [threadStarted('thread-1'), agentMessageCompleted('Done'), turnCompleted()],
        null,
        0
      );

      await executePromise;

      const spawnArgs = vi.mocked(mockSpawn).mock.calls[0][1] as string[];
      expect(spawnArgs).toContain('exec');
      expect(spawnArgs).toContain('-');
      expect(spawnArgs).toContain('--json');
      expect(spawnArgs).toContain('--sandbox');
      expect(spawnArgs).toContain('danger-full-access');
      expect(spawnArgs).toContain('--skip-git-repo-check');
      expect(spawnArgs).toContain('--color');
      expect(spawnArgs).toContain('never');
    });

    it('should pipe prompt via stdin, not in CLI args', async () => {
      const mockProc = createMockChildProcess();
      vi.mocked(mockSpawn).mockReturnValue(mockProc as any);

      const stdinWriteSpy = vi.spyOn(mockProc.stdin, 'write');

      const executePromise = executor.execute('My big prompt', { silent: true });
      emitJsonlLines(
        mockProc,
        [threadStarted('t-1'), agentMessageCompleted('Result'), turnCompleted()],
        null,
        0
      );

      await executePromise;

      // Prompt written to stdin
      expect(stdinWriteSpy).toHaveBeenCalledWith('My big prompt');
      // Prompt NOT in CLI args
      const spawnArgs = vi.mocked(mockSpawn).mock.calls[0][1] as string[];
      expect(spawnArgs).not.toContain('My big prompt');
    });

    it('should parse JSONL to extract response text from agent_message events', async () => {
      const mockProc = createMockChildProcess();
      vi.mocked(mockSpawn).mockReturnValue(mockProc as any);

      const executePromise = executor.execute('Prompt', { silent: true });
      emitJsonlLines(
        mockProc,
        [
          threadStarted('t-1'),
          agentMessageCompleted('Hello '),
          agentMessageCompleted('World'),
          turnCompleted(),
        ],
        null,
        0
      );

      const result = await executePromise;
      expect(result.result).toBe('Hello World');
    });

    it('should extract thread_id from thread.started as sessionId', async () => {
      const mockProc = createMockChildProcess();
      vi.mocked(mockSpawn).mockReturnValue(mockProc as any);

      const executePromise = executor.execute('Prompt', { silent: true });
      emitJsonlLines(
        mockProc,
        [threadStarted('my-thread-abc'), agentMessageCompleted('OK'), turnCompleted()],
        null,
        0
      );

      const result = await executePromise;
      expect(result.sessionId).toBe('my-thread-abc');
    });

    it('should return undefined sessionId when thread.started is missing', async () => {
      const mockProc = createMockChildProcess();
      vi.mocked(mockSpawn).mockReturnValue(mockProc as any);

      const executePromise = executor.execute('Prompt', { silent: true });
      emitJsonlLines(mockProc, [agentMessageCompleted('OK'), turnCompleted()], null, 0);

      const result = await executePromise;
      expect(result.sessionId).toBeUndefined();
    });

    it('should handle agent_message with string content', async () => {
      const mockProc = createMockChildProcess();
      vi.mocked(mockSpawn).mockReturnValue(mockProc as any);

      const executePromise = executor.execute('Prompt', { silent: true });
      emitJsonlLines(
        mockProc,
        [
          threadStarted('t-1'),
          JSON.stringify({
            type: 'item.completed',
            item: { type: 'agent_message', content: 'Plain string content' },
          }),
          turnCompleted(),
        ],
        null,
        0
      );

      const result = await executePromise;
      expect(result.result).toBe('Plain string content');
    });

    // --- Task 4: model, cwd, usage ---

    it('should pass --model flag when model option is provided', async () => {
      const mockProc = createMockChildProcess();
      vi.mocked(mockSpawn).mockReturnValue(mockProc as any);

      const executePromise = executor.execute('Test', {
        model: 'gpt-5.4',
        silent: true,
      });
      emitJsonlLines(
        mockProc,
        [threadStarted('t-1'), agentMessageCompleted('OK'), turnCompleted()],
        null,
        0
      );

      await executePromise;

      const spawnArgs = vi.mocked(mockSpawn).mock.calls[0][1] as string[];
      expect(spawnArgs).toContain('--model');
      expect(spawnArgs).toContain('gpt-5.4');
    });

    it('should pass --cd flag when cwd option is provided', async () => {
      const mockProc = createMockChildProcess();
      vi.mocked(mockSpawn).mockReturnValue(mockProc as any);

      const executePromise = executor.execute('Test', {
        cwd: '/some/project',
        silent: true,
      });
      emitJsonlLines(
        mockProc,
        [threadStarted('t-1'), agentMessageCompleted('OK'), turnCompleted()],
        null,
        0
      );

      await executePromise;

      const spawnArgs = vi.mocked(mockSpawn).mock.calls[0][1] as string[];
      expect(spawnArgs).toContain('--cd');
      expect(spawnArgs).toContain('/some/project');
    });

    it('should extract usage from turn.completed JSONL event', async () => {
      const mockProc = createMockChildProcess();
      vi.mocked(mockSpawn).mockReturnValue(mockProc as any);

      const executePromise = executor.execute('Test', { silent: true });
      emitJsonlLines(
        mockProc,
        [
          threadStarted('t-1'),
          agentMessageCompleted('OK'),
          turnCompleted({ input_tokens: 200, output_tokens: 50 }),
        ],
        null,
        0
      );

      const result = await executePromise;
      expect(result.usage).toEqual({ inputTokens: 200, outputTokens: 50 });
    });

    it('should return undefined usage when turn.completed has no usage data', async () => {
      const mockProc = createMockChildProcess();
      vi.mocked(mockSpawn).mockReturnValue(mockProc as any);

      const executePromise = executor.execute('Test', { silent: true });
      emitJsonlLines(
        mockProc,
        [threadStarted('t-1'), agentMessageCompleted('OK'), turnCompleted()],
        null,
        0
      );

      const result = await executePromise;
      expect(result.usage).toBeUndefined();
    });

    // --- Task 5: Authentication injection ---

    it('should set CODEX_API_KEY when authConfig uses token auth', async () => {
      const authConfig: AgentConfig = {
        type: AgentType.CodexCli,
        authMethod: 'token' as any,
        token: 'my-codex-key-123',
      };
      const tokenExecutor = new CodexCliExecutorService(mockSpawn, authConfig);
      const mockProc = createMockChildProcess();
      vi.mocked(mockSpawn).mockReturnValue(mockProc as any);

      const executePromise = tokenExecutor.execute('Test', { silent: true });
      emitJsonlLines(
        mockProc,
        [threadStarted('t-1'), agentMessageCompleted('OK'), turnCompleted()],
        null,
        0
      );

      await executePromise;

      const spawnOpts = vi.mocked(mockSpawn).mock.calls[0][2] as Record<string, unknown>;
      const env = spawnOpts.env as Record<string, string>;
      expect(env.CODEX_API_KEY).toBe('my-codex-key-123');
    });

    it('should NOT set CODEX_API_KEY when authConfig uses session auth', async () => {
      const originalKey = process.env.CODEX_API_KEY;
      delete process.env.CODEX_API_KEY;

      const authConfig: AgentConfig = {
        type: AgentType.CodexCli,
        authMethod: 'session' as any,
      };
      const sessionExecutor = new CodexCliExecutorService(mockSpawn, authConfig);
      const mockProc = createMockChildProcess();
      vi.mocked(mockSpawn).mockReturnValue(mockProc as any);

      const executePromise = sessionExecutor.execute('Test', { silent: true });
      emitJsonlLines(
        mockProc,
        [threadStarted('t-1'), agentMessageCompleted('OK'), turnCompleted()],
        null,
        0
      );

      await executePromise;

      const spawnOpts = vi.mocked(mockSpawn).mock.calls[0][2] as Record<string, unknown>;
      const env = spawnOpts.env as Record<string, string>;
      expect(env.CODEX_API_KEY).toBeUndefined();

      if (originalKey !== undefined) process.env.CODEX_API_KEY = originalKey;
    });

    it('should strip CLAUDECODE from spawn environment', async () => {
      const originalEnv = process.env.CLAUDECODE;
      process.env.CLAUDECODE = 'some-value';

      const mockProc = createMockChildProcess();
      vi.mocked(mockSpawn).mockReturnValue(mockProc as any);

      const executePromise = executor.execute('Test', { silent: true });
      emitJsonlLines(
        mockProc,
        [threadStarted('t-1'), agentMessageCompleted('OK'), turnCompleted()],
        null,
        0
      );

      await executePromise;

      const spawnOpts = vi.mocked(mockSpawn).mock.calls[0][2] as Record<string, unknown>;
      const env = spawnOpts.env as Record<string, string>;
      expect(env.CLAUDECODE).toBeUndefined();

      if (originalEnv !== undefined) process.env.CLAUDECODE = originalEnv;
      else delete process.env.CLAUDECODE;
    });

    // --- Task 6: Session resume ---

    it('should use resume syntax when resumeSession is provided', async () => {
      const mockProc = createMockChildProcess();
      vi.mocked(mockSpawn).mockReturnValue(mockProc as any);

      const executePromise = executor.execute('Continue work', {
        resumeSession: 'thread-abc-123',
        silent: true,
      });
      emitJsonlLines(
        mockProc,
        [threadStarted('thread-abc-123'), agentMessageCompleted('Resumed'), turnCompleted()],
        null,
        0
      );

      await executePromise;

      const spawnArgs = vi.mocked(mockSpawn).mock.calls[0][1] as string[];
      expect(spawnArgs).toContain('exec');
      expect(spawnArgs).toContain('resume');
      expect(spawnArgs).toContain('thread-abc-123');
    });

    it('should pipe resume prompt via stdin instead of putting it in CLI args', async () => {
      const mockProc = createMockChildProcess();
      vi.mocked(mockSpawn).mockReturnValue(mockProc as any);

      const stdinWriteSpy = vi.spyOn(mockProc.stdin, 'write');

      const executePromise = executor.execute('Follow-up prompt', {
        resumeSession: 'thread-abc',
        silent: true,
      });
      emitJsonlLines(
        mockProc,
        [threadStarted('thread-abc'), agentMessageCompleted('Done'), turnCompleted()],
        null,
        0
      );

      await executePromise;

      const spawnArgs = vi.mocked(mockSpawn).mock.calls[0][1] as string[];
      expect(spawnArgs).not.toContain('Follow-up prompt');
      expect(spawnArgs.slice(-3)).toEqual(['resume', 'thread-abc', '-']);
      expect(stdinWriteSpy).toHaveBeenCalledWith('Follow-up prompt');
    });

    it('should still use stdin for non-resume executions', async () => {
      const mockProc = createMockChildProcess();
      vi.mocked(mockSpawn).mockReturnValue(mockProc as any);

      const stdinWriteSpy = vi.spyOn(mockProc.stdin, 'write');

      const executePromise = executor.execute('Initial prompt', { silent: true });
      emitJsonlLines(
        mockProc,
        [threadStarted('t-1'), agentMessageCompleted('OK'), turnCompleted()],
        null,
        0
      );

      await executePromise;

      expect(stdinWriteSpy).toHaveBeenCalledWith('Initial prompt');
      const spawnArgs = vi.mocked(mockSpawn).mock.calls[0][1] as string[];
      expect(spawnArgs).toContain('-');
      expect(spawnArgs).not.toContain('resume');
    });

    it('should place exec-level flags before the resume subcommand', async () => {
      const mockProc = createMockChildProcess();
      vi.mocked(mockSpawn).mockReturnValue(mockProc as any);

      const executePromise = executor.execute('More work', {
        resumeSession: 'thread-xyz',
        model: 'gpt-5.6-sol',
        cwd: '/some/project',
        outputSchema: { type: 'object' },
        silent: true,
      });
      emitJsonlLines(
        mockProc,
        [threadStarted('thread-xyz'), agentMessageCompleted('Done'), turnCompleted()],
        null,
        0
      );

      await executePromise;

      const spawnArgs = vi.mocked(mockSpawn).mock.calls[0][1] as string[];
      const resumeIndex = spawnArgs.indexOf('resume');
      expect(resumeIndex).toBeGreaterThan(0);

      const execFlags = spawnArgs.slice(0, resumeIndex);
      expect(execFlags[0]).toBe('exec');
      expect(execFlags).toContain('--json');
      expect(execFlags).toContain('--sandbox');
      expect(execFlags).toContain('danger-full-access');
      expect(execFlags).toContain('--skip-git-repo-check');
      expect(execFlags).toContain('--color');
      expect(execFlags).toContain('never');
      expect(execFlags).toContain('--model');
      expect(execFlags).toContain('gpt-5.6-sol');
      expect(execFlags).toContain('--cd');
      expect(execFlags).toContain('/some/project');
      expect(execFlags).toContain('--output-schema');

      expect(spawnArgs.slice(resumeIndex)).toEqual(['resume', 'thread-xyz', '-']);
    });

    // --- Task 7: Error handling ---

    it('should include install instructions on ENOENT error', async () => {
      const mockProc = createMockChildProcess();
      vi.mocked(mockSpawn).mockReturnValue(mockProc as any);

      const executePromise = executor.execute('Test', { silent: true });

      process.nextTick(() => {
        const error = new Error('spawn codex ENOENT') as Error & { code: string };
        error.code = 'ENOENT';
        mockProc.emit('error', error);
      });

      await expect(executePromise).rejects.toThrow(
        'Codex CLI ("codex") not found. Please install it: npm i -g @openai/codex'
      );
    });

    it('should reject with stderr content on non-zero exit code', async () => {
      const mockProc = createMockChildProcess();
      vi.mocked(mockSpawn).mockReturnValue(mockProc as any);

      const executePromise = executor.execute('Bad prompt', { silent: true });
      emitJsonlLines(mockProc, [], 'Error: Authentication failed', 1);

      await expect(executePromise).rejects.toThrow('Process exited with code 1');
    });

    it('should include stderr in error message on non-zero exit', async () => {
      const mockProc = createMockChildProcess();
      vi.mocked(mockSpawn).mockReturnValue(mockProc as any);

      const executePromise = executor.execute('Bad prompt', { silent: true });
      emitJsonlLines(mockProc, [], 'Authentication failed', 1);

      await expect(executePromise).rejects.toThrow('Authentication failed');
    });

    it('should skip malformed JSON lines gracefully', async () => {
      const mockProc = createMockChildProcess();
      vi.mocked(mockSpawn).mockReturnValue(mockProc as any);

      const executePromise = executor.execute('Prompt', { silent: true });
      emitJsonlLines(
        mockProc,
        [
          threadStarted('t-1'),
          'this is not valid json {{{',
          agentMessageCompleted('Result text'),
          turnCompleted(),
        ],
        null,
        0
      );

      const result = await executePromise;
      expect(result.result).toBe('Result text');
    });

    it('should apply timeout and kill subprocess', async () => {
      vi.useFakeTimers();
      const mockProc = createMockChildProcess();
      vi.mocked(mockSpawn).mockReturnValue(mockProc as any);

      const executePromise = executor.execute('Long running', { timeout: 5000, silent: true });

      vi.advanceTimersByTime(5001);

      mockProc.stdout.end();
      mockProc.stderr.end();
      mockProc.emit('close', null);

      await expect(executePromise).rejects.toThrow('Agent execution timed out after 5s');
      expect(mockProc.kill).toHaveBeenCalled();
      vi.useRealTimers();
    });

    it('should detect fatal stderr patterns when exit 0 produced no answer', async () => {
      const mockProc = createMockChildProcess();
      vi.mocked(mockSpawn).mockReturnValue(mockProc as any);

      const executePromise = executor.execute('Test', { silent: true });
      emitJsonlLines(mockProc, [threadStarted('t-1')], 'authentication failed: invalid api key', 0);

      await expect(executePromise).rejects.toThrow(/stderr reports a fatal error/i);
    });

    it('should keep the answer when stderr noise accompanies a completed run', async () => {
      const mockProc = createMockChildProcess();
      vi.mocked(mockSpawn).mockReturnValue(mockProc as any);

      // The agent produced a complete message and exited 0. Whatever a
      // sub-request logged on the way, the work exists and must be returned.
      const executePromise = executor.execute('Test', { silent: true });
      emitJsonlLines(
        mockProc,
        [threadStarted('t-1'), agentMessageCompleted('Partial')],
        'authentication failed: invalid api key',
        0
      );

      expect((await executePromise).result).toBe('Partial');
    });

    it('should detect an exhausted rate limit when exit 0 produced no answer', async () => {
      const mockProc = createMockChildProcess();
      vi.mocked(mockSpawn).mockReturnValue(mockProc as any);

      const executePromise = executor.execute('Test', { silent: true });
      emitJsonlLines(mockProc, [threadStarted('t-1')], 'rate limit exceeded for model gpt-5.4', 0);

      await expect(executePromise).rejects.toThrow(/stderr reports a fatal error/i);
    });

    it('should not treat a rate-limit WARNING as a failed run', async () => {
      const mockProc = createMockChildProcess();
      vi.mocked(mockSpawn).mockReturnValue(mockProc as any);

      const executePromise = executor.execute('Test', { silent: true });
      emitJsonlLines(
        mockProc,
        [threadStarted('t-1'), agentMessageCompleted('All done'), turnCompleted()],
        '[warn] approaching rate limit',
        0
      );

      expect((await executePromise).result).toBe('All done');
    });

    it('should NOT reject for non-fatal stderr messages with exit code 0', async () => {
      const mockProc = createMockChildProcess();
      vi.mocked(mockSpawn).mockReturnValue(mockProc as any);

      const executePromise = executor.execute('Test', { silent: true });
      emitJsonlLines(
        mockProc,
        [threadStarted('t-1'), agentMessageCompleted('Success!'), turnCompleted()],
        'Warning: something benign happened\nLoading model...',
        0
      );

      const result = await executePromise;
      expect(result.result).toBe('Success!');
    });

    // --- Task 9: Structured output ---

    it('should pass --output-schema flag when outputSchema is provided', async () => {
      const mockProc = createMockChildProcess();
      vi.mocked(mockSpawn).mockReturnValue(mockProc as any);

      const executePromise = executor.execute('Test', {
        outputSchema: { type: 'object', properties: { name: { type: 'string' } } },
        silent: true,
      });
      emitJsonlLines(
        mockProc,
        [threadStarted('t-1'), agentMessageCompleted('{"name":"test"}'), turnCompleted()],
        null,
        0
      );

      await executePromise;

      const spawnArgs = vi.mocked(mockSpawn).mock.calls[0][1] as string[];
      expect(spawnArgs).toContain('--output-schema');
      // The next arg should be a temp file path
      const schemaIdx = spawnArgs.indexOf('--output-schema');
      const schemaPath = spawnArgs[schemaIdx + 1];
      expect(schemaPath).toMatch(/codex-schema-/);
    });

    it('should NOT include --output-schema flag when outputSchema is not provided', async () => {
      const mockProc = createMockChildProcess();
      vi.mocked(mockSpawn).mockReturnValue(mockProc as any);

      const executePromise = executor.execute('Test', { silent: true });
      emitJsonlLines(
        mockProc,
        [threadStarted('t-1'), agentMessageCompleted('OK'), turnCompleted()],
        null,
        0
      );

      await executePromise;

      const spawnArgs = vi.mocked(mockSpawn).mock.calls[0][1] as string[];
      expect(spawnArgs).not.toContain('--output-schema');
    });

    it('should clean up temp schema file even on execution error', async () => {
      const mockProc = createMockChildProcess();
      vi.mocked(mockSpawn).mockReturnValue(mockProc as any);

      const executePromise = executor.execute('Test', {
        outputSchema: { type: 'object' },
        silent: true,
      });

      // Capture the temp file path from the spawn args
      const spawnArgs = vi.mocked(mockSpawn).mock.calls[0][1] as string[];
      const schemaIdx = spawnArgs.indexOf('--output-schema');
      const tempPath = spawnArgs[schemaIdx + 1];

      emitJsonlLines(mockProc, [], 'Fatal error', 1);

      await expect(executePromise).rejects.toThrow();

      // After the promise rejects, the finally block should have cleaned up.
      // Verify the temp file no longer exists (it was created by the real fs.writeFileSync
      // and should be deleted by the finally block's fs.unlinkSync).
      expect(fs.existsSync(tempPath)).toBe(false);
    });
  });

  // --- Task 8: executeStream ---

  describe('executeStream', () => {
    const tick = () => new Promise((r) => setTimeout(r, 10));

    /** Collect all stream events, writing stdout lines and closing the process */
    async function streamWith(
      exec: CodexCliExecutorService,
      opts: {
        lines?: string[];
        stderrData?: string;
        exitCode?: number;
        execOpts?: Parameters<CodexCliExecutorService['executeStream']>[1];
        emitError?: Error;
      } = {}
    ): Promise<{ type: string; content: string }[]> {
      const mockProc = createMockChildProcess();
      vi.mocked(mockSpawn).mockReturnValue(mockProc as any);
      const events: { type: string; content: string }[] = [];
      const promise = (async () => {
        for await (const e of exec.executeStream('prompt', { silent: true, ...opts.execOpts })) {
          events.push({ type: e.type, content: e.content });
        }
      })();
      await tick();
      if (opts.emitError) {
        mockProc.emit('error', opts.emitError);
        await promise;
        return events;
      }
      for (const l of opts.lines ?? []) mockProc.stdout.write(`${l}\n`);
      if (opts.stderrData) mockProc.stderr.write(opts.stderrData);
      await tick();
      mockProc.stdout.end();
      mockProc.stderr.end();
      mockProc.emit('close', opts.exitCode ?? 0);
      await promise;
      return events;
    }

    it('should yield progress events for agent_message item.started', async () => {
      const events = await streamWith(executor, {
        lines: [
          threadStarted('t-1'),
          itemStarted('agent_message'),
          agentMessageCompleted('Done'),
          turnCompleted(),
        ],
      });
      expect(events).toContainEqual({ type: 'progress', content: '' });
    });

    it('should yield progress events for agent_message item.updated with delta', async () => {
      const events = await streamWith(executor, {
        lines: [
          threadStarted('t-1'),
          itemUpdated('agent_message', [{ type: 'text', text: 'Working...' }]),
          agentMessageCompleted('Working... done'),
          turnCompleted(),
        ],
      });
      expect(events).toContainEqual({ type: 'progress', content: 'Working...' });
    });

    it('should yield progress events for command_execution', async () => {
      const events = await streamWith(executor, {
        lines: [
          threadStarted('t-1'),
          itemStarted('command_execution', { command: 'npm test' }),
          itemCompleted('command_execution', { exit_code: 0 }),
          agentMessageCompleted('Tests passed'),
          turnCompleted(),
        ],
      });
      expect(events).toContainEqual({ type: 'progress', content: 'Running: npm test' });
      expect(events).toContainEqual({
        type: 'progress',
        content: 'Command completed (exit 0)',
      });
    });

    it('should yield progress events for file_change', async () => {
      const events = await streamWith(executor, {
        lines: [
          threadStarted('t-1'),
          itemStarted('file_change'),
          itemCompleted('file_change', { file: 'src/index.ts' }),
          agentMessageCompleted('Modified file'),
          turnCompleted(),
        ],
      });
      expect(events).toContainEqual({ type: 'progress', content: 'Modifying files' });
      expect(events).toContainEqual({ type: 'progress', content: 'Modified: src/index.ts' });
    });

    it('should yield result event with accumulated text on turn.completed', async () => {
      const events = await streamWith(executor, {
        lines: [
          threadStarted('t-1'),
          agentMessageCompleted('Part 1 '),
          agentMessageCompleted('Part 2'),
          turnCompleted(),
        ],
      });
      expect(events).toContainEqual({ type: 'result', content: 'Part 1 Part 2' });
    });

    it('should yield error event on turn.failed', async () => {
      const events = await streamWith(executor, {
        lines: [
          threadStarted('t-1'),
          JSON.stringify({ type: 'turn.failed', error: { message: 'Token limit exceeded' } }),
        ],
      });
      expect(events).toContainEqual({ type: 'error', content: 'Token limit exceeded' });
    });

    it('should skip unknown event types gracefully', async () => {
      const events = await streamWith(executor, {
        lines: [
          threadStarted('t-1'),
          JSON.stringify({ type: 'heartbeat', ts: 123 }),
          agentMessageCompleted('Done'),
          turnCompleted(),
        ],
      });
      // Should only have progress (from item.completed) and result events, no heartbeat
      const heartbeatEvents = events.filter((e) => e.content === '123');
      expect(heartbeatEvents).toHaveLength(0);
    });

    it('should yield non-JSON lines as raw progress', async () => {
      const events = await streamWith(executor, {
        lines: ['Loading model weights...'],
      });
      expect(events).toContainEqual({ type: 'progress', content: 'Loading model weights...' });
    });

    it('should emit error event on non-zero exit code', async () => {
      const events = await streamWith(executor, {
        stderrData: 'Auth error',
        exitCode: 1,
      });
      expect(events).toContainEqual(
        expect.objectContaining({
          type: 'error',
          content: expect.stringContaining('Auth error'),
        })
      );
    });

    it('should emit error event on spawn error', async () => {
      const events = await streamWith(executor, {
        emitError: new Error('spawn codex ENOENT'),
      });
      expect(events).toContainEqual({ type: 'error', content: 'spawn codex ENOENT' });
    });

    it('should emit error event when stderr contains fatal patterns on exit 0', async () => {
      const events = await streamWith(executor, {
        stderrData: 'authentication failed: invalid api key',
        exitCode: 0,
      });
      expect(events).toContainEqual(
        expect.objectContaining({
          type: 'error',
          content: expect.stringContaining('fatal'),
        })
      );
    });

    it('should use stdin-backed resume syntax in streaming mode', async () => {
      const mockWrite = vi.fn();
      const originalReturn = vi.mocked(mockSpawn).getMockImplementation();

      vi.mocked(mockSpawn).mockImplementation(() => {
        const proc = createMockChildProcess();
        vi.spyOn(proc.stdin, 'write').mockImplementation(((chunk: any) => {
          mockWrite(chunk);
          return true;
        }) as any);
        process.nextTick(() => {
          proc.stdout.write(`${threadStarted('t-abc')}\n`);
          proc.stdout.write(`${agentMessageCompleted('OK')}\n`);
          proc.stdout.write(`${turnCompleted()}\n`);
          proc.stdout.end();
          proc.stderr.end();
          proc.emit('close', 0);
        });
        return proc as any;
      });

      const events: { type: string; content: string }[] = [];
      for await (const e of executor.executeStream('stream follow-up', {
        resumeSession: 'thread-abc',
        silent: true,
      })) {
        events.push({ type: e.type, content: e.content });
      }

      const spawnArgs = vi.mocked(mockSpawn).mock.calls[0][1] as string[];
      expect(spawnArgs.slice(-3)).toEqual(['resume', 'thread-abc', '-']);
      expect(spawnArgs).not.toContain('stream follow-up');
      expect(mockWrite).toHaveBeenCalledWith('stream follow-up');
      expect(events).toContainEqual({ type: 'result', content: 'OK' });

      if (originalReturn) vi.mocked(mockSpawn).mockImplementation(originalReturn);
    });

    it('should set CODEX_API_KEY when using token auth in streaming mode', async () => {
      const authConfig: AgentConfig = {
        type: AgentType.CodexCli,
        authMethod: 'token' as any,
        token: 'stream-key-456',
      };
      const tokenExecutor = new CodexCliExecutorService(mockSpawn, authConfig);
      await streamWith(tokenExecutor, {
        lines: [threadStarted('t-1'), agentMessageCompleted('OK'), turnCompleted()],
      });
      const spawnOpts = vi.mocked(mockSpawn).mock.calls[0][2] as Record<string, unknown>;
      expect((spawnOpts.env as Record<string, string>).CODEX_API_KEY).toBe('stream-key-456');
    });

    it('should yield error event from error JSONL events', async () => {
      const events = await streamWith(executor, {
        lines: [JSON.stringify({ type: 'error', message: 'Unexpected API error' })],
      });
      expect(events).toContainEqual({ type: 'error', content: 'Unexpected API error' });
    });
  });
  // --- defects proven by audit: UTF-8, stdin, deltas, policy, lifetime ---

  describe('multi-byte output', () => {
    it('should not corrupt a character split across two stdout chunks', async () => {
      const mockProc = createMockChildProcess();
      vi.mocked(mockSpawn).mockReturnValue(mockProc as any);

      const answer = 'héllo — ✅ 日本語 🚀 done';
      const payload = Buffer.from(`${agentMessageCompleted(answer)}\n`, 'utf8');
      const splitAt = payload.indexOf(Buffer.from('🚀', 'utf8')) + 2;

      const executePromise = executor.execute('Test', { silent: true });
      process.nextTick(() => {
        mockProc.stdout.write(payload.subarray(0, splitAt));
        mockProc.stdout.write(payload.subarray(splitAt));
        mockProc.stdout.end();
        mockProc.stderr.end();
        mockProc.emit('close', 0);
      });

      expect((await executePromise).result).toBe(answer);
    });
  });

  describe('prompt delivery', () => {
    it('should survive an EPIPE when the CLI exits before reading the prompt', async () => {
      const mockProc = createMockChildProcess();
      vi.mocked(mockSpawn).mockReturnValue(mockProc as any);

      const executePromise = executor.execute('a large prompt', { silent: true });

      expect(() =>
        mockProc.stdin.emit('error', Object.assign(new Error('write EPIPE'), { code: 'EPIPE' }))
      ).not.toThrow();

      emitJsonlLines(mockProc, [], 'bad flag', 1);
      await expect(executePromise).rejects.toThrow(/bad flag/);
    });
  });

  describe('signal termination', () => {
    // A signal kill (OOM killer, external kill) mid-turn is not a finished turn,
    // even when some agent text was already captured.
    it('should reject naming the signal when killed after partial text', async () => {
      const mockProc = createMockChildProcess();
      vi.mocked(mockSpawn).mockReturnValue(mockProc as any);

      const executePromise = executor.execute('Test', { silent: true });
      process.nextTick(() => {
        for (const line of [threadStarted('t-1'), agentMessageCompleted('partial work')])
          mockProc.stdout.write(`${line}\n`);
        mockProc.stdout.end();
        mockProc.stderr.end();
        mockProc.emit('close', null, 'SIGKILL');
      });

      await expect(executePromise).rejects.toThrow(/SIGKILL/);
    });

    it('should keep the answer when the signal arrives after turn.completed', async () => {
      const mockProc = createMockChildProcess();
      vi.mocked(mockSpawn).mockReturnValue(mockProc as any);

      const executePromise = executor.execute('Test', { silent: true });
      process.nextTick(() => {
        for (const line of [
          threadStarted('t-1'),
          agentMessageCompleted('all done'),
          turnCompleted(),
        ])
          mockProc.stdout.write(`${line}\n`);
        mockProc.stdout.end();
        mockProc.stderr.end();
        mockProc.emit('close', null, 'SIGTERM');
      });

      expect((await executePromise).result).toBe('all done');
    });

    it('should stream an error, not a result, when killed after partial text', async () => {
      const mockProc = createMockChildProcess();
      vi.mocked(mockSpawn).mockReturnValue(mockProc as any);

      process.nextTick(() => {
        for (const line of [threadStarted('t-1'), agentMessageCompleted('partial work')])
          mockProc.stdout.write(`${line}\n`);
        mockProc.stdout.end();
        mockProc.stderr.end();
        mockProc.emit('close', null, 'SIGKILL');
      });
      const events: { type: string; content: string }[] = [];
      for await (const event of executor.executeStream('Test', { silent: true })) {
        events.push({ type: event.type, content: event.content });
      }

      expect(events.some((e) => e.type === 'error' && e.content.includes('SIGKILL'))).toBe(true);
      expect(events.some((e) => e.type === 'result')).toBe(false);
    });

    it('should reject when the turn failed even though text was captured', async () => {
      const mockProc = createMockChildProcess();
      vi.mocked(mockSpawn).mockReturnValue(mockProc as any);

      const executePromise = executor.execute('Test', { silent: true });
      emitJsonlLines(
        mockProc,
        [
          threadStarted('t-1'),
          agentMessageCompleted('partial work'),
          JSON.stringify({ type: 'turn.failed', error: { message: 'context window exceeded' } }),
        ],
        null,
        0
      );

      await expect(executePromise).rejects.toThrow('context window exceeded');
    });

    it('should name the signal when the CLI is killed with nothing captured', async () => {
      const mockProc = createMockChildProcess();
      vi.mocked(mockSpawn).mockReturnValue(mockProc as any);

      const executePromise = executor.execute('Test', { silent: true });
      process.nextTick(() => {
        mockProc.stdout.end();
        mockProc.stderr.end();
        mockProc.emit('close', null, 'SIGKILL');
      });

      await expect(executePromise).rejects.toThrow(/SIGKILL/);
    });
  });

  describe('security constraints', () => {
    it('should refuse execute() under an enforced strict sandbox', async () => {
      await expect(
        executor.execute('Test', {
          silent: true,
          securityConstraints: strictConstraints(SecurityMode.Enforce),
        })
      ).rejects.toBeInstanceOf(SecurityViolationError);

      expect(mockSpawn).not.toHaveBeenCalled();
    });

    it('should refuse executeStream() under an enforced strict sandbox', async () => {
      const iterate = async () => {
        for await (const _event of executor.executeStream('Test', {
          silent: true,
          securityConstraints: strictConstraints(SecurityMode.Enforce),
        })) {
          // validation runs before the spawn
        }
      };

      await expect(iterate()).rejects.toBeInstanceOf(SecurityViolationError);
      expect(mockSpawn).not.toHaveBeenCalled();
    });
  });

  describe('streamed deltas', () => {
    it('should emit only the newly added text, not the accumulated message', async () => {
      const mockProc = createMockChildProcess();
      vi.mocked(mockSpawn).mockReturnValue(mockProc as any);

      const events: { type: string; content: string }[] = [];
      const gen = executor.executeStream('Test', { silent: true });

      process.nextTick(() => {
        mockProc.stdout.write(`${threadStarted('t-1')}\n`);
        mockProc.stdout.write(
          `${JSON.stringify({ type: 'item.updated', item: { type: 'agent_message', text: 'Hel' } })}\n`
        );
        mockProc.stdout.write(
          `${JSON.stringify({ type: 'item.updated', item: { type: 'agent_message', text: 'Hello' } })}\n`
        );
        mockProc.stdout.write(
          `${JSON.stringify({ type: 'item.updated', item: { type: 'agent_message', text: 'Hello world' } })}\n`
        );
        mockProc.stdout.write(`${turnCompleted()}\n`);
        mockProc.stdout.end();
        mockProc.stderr.end();
        mockProc.emit('close', 0);
      });

      for await (const event of gen) {
        events.push({ type: event.type, content: event.content });
      }

      // A live consumer concatenates progress events; emitting the whole
      // accumulated message each time rendered "HelHelloHello world".
      const rendered = events
        .filter((e) => e.type === 'progress')
        .map((e) => e.content)
        .join('');
      expect(rendered).toBe('Hello world');
    });

    it('should stringify a structured error payload instead of [object Object]', async () => {
      const mockProc = createMockChildProcess();
      vi.mocked(mockSpawn).mockReturnValue(mockProc as any);

      const events: { type: string; content: string }[] = [];
      const gen = executor.executeStream('Test', { silent: true });

      process.nextTick(() => {
        mockProc.stdout.write(
          `${JSON.stringify({ type: 'error', error: { code: 500, detail: 'upstream boom' } })}\n`
        );
        mockProc.stdout.end();
        mockProc.stderr.end();
        mockProc.emit('close', 0);
      });

      for await (const event of gen) {
        events.push({ type: event.type, content: event.content });
      }

      const errorEvent = events.find((e) => e.type === 'error');
      expect(errorEvent?.content).not.toContain('[object Object]');
      expect(errorEvent?.content).toContain('upstream boom');
    });
  });

  describe('executeStream lifetime', () => {
    it('should time out a stream that never closes, naming the budget', async () => {
      const mockProc = createMockChildProcess();
      vi.mocked(mockSpawn).mockReturnValue(mockProc as any);

      const events: { type: string; content: string }[] = [];
      for await (const event of executor.executeStream('Test', { silent: true, timeout: 20 })) {
        events.push({ type: event.type, content: event.content });
      }

      expect(events).toContainEqual({
        type: 'error',
        content: 'Agent execution timed out after 0.02s',
      });
      expect(mockProc.kill).toHaveBeenCalled();
    });

    it('should kill the child when the consumer stops iterating early', async () => {
      const mockProc = createMockChildProcess();
      vi.mocked(mockSpawn).mockReturnValue(mockProc as any);

      const gen = executor.executeStream('Test', { silent: true });
      process.nextTick(() => {
        mockProc.stdout.write(`${itemStarted('command_execution', { command: 'npm test' })}\n`);
      });

      for await (const _event of gen) {
        break;
      }

      expect(mockProc.kill).toHaveBeenCalled();
    });
  });
});
