/**
 * ClaudeCodeExecutorService Unit Tests
 *
 * Tests for the Claude Code subprocess executor service.
 * Uses constructor-injected spawn function mock (NOT vi.mock of child_process).
 *
 * TDD Phase: RED-GREEN
 */

import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { ClaudeCodeExecutorService } from '@/infrastructure/services/agents/common/executors/claude-code-executor.service.js';
import type { SpawnFunction } from '@/infrastructure/services/agents/common/types.js';
import { AgentType, AgentFeature } from '@/domain/generated/output.js';

/**
 * Creates a mock ChildProcess-like object that can emit events and provide
 * stdout/stderr streams for testing subprocess interactions.
 * Uses PassThrough streams (duplex) that immediately emit data events
 * when written to, avoiding buffering issues with Readable in paused mode.
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

/**
 * Build a stream-json result line matching real Claude CLI output format.
 * Tokens are nested inside a `usage` object (not top-level).
 */
function buildStreamResult(data: {
  result?: string;
  session_id?: string;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    cache_creation_input_tokens?: number;
    cache_read_input_tokens?: number;
  };
  [key: string]: unknown;
}): string {
  return JSON.stringify({ type: 'result', ...data });
}

/** Emit stream-json lines followed by close */
function emitStreamData(
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

describe('ClaudeCodeExecutorService', () => {
  let mockSpawn: SpawnFunction;
  let executor: ClaudeCodeExecutorService;

  beforeEach(() => {
    mockSpawn = vi.fn();
    executor = new ClaudeCodeExecutorService(mockSpawn);
  });

  describe('agentType', () => {
    it('should have agentType of ClaudeCode', () => {
      expect(executor.agentType).toBe(AgentType.ClaudeCode);
    });
  });

  describe('supportsFeature', () => {
    it('should support session-resume feature', () => {
      expect(executor.supportsFeature(AgentFeature.sessionResume)).toBe(true);
    });

    it('should support streaming feature', () => {
      expect(executor.supportsFeature(AgentFeature.streaming)).toBe(true);
    });

    it('should support system-prompt feature', () => {
      expect(executor.supportsFeature(AgentFeature.systemPrompt)).toBe(true);
    });

    it('should support structured-output feature', () => {
      expect(executor.supportsFeature(AgentFeature.structuredOutput)).toBe(true);
    });

    it('should support session-listing feature', () => {
      expect(executor.supportsFeature(AgentFeature.sessionListing)).toBe(true);
    });

    it('should NOT support tool-scoping feature', () => {
      expect(executor.supportsFeature(AgentFeature.toolScoping)).toBe(false);
    });
  });

  describe('execute', () => {
    it('should execute prompt and return result from stream', async () => {
      // Arrange
      const mockProc = createMockChildProcess();
      vi.mocked(mockSpawn).mockReturnValue(mockProc as any);

      const resultLine = buildStreamResult({
        result: 'Analysis complete. Found 3 files.',
        session_id: 'sess-abc-123',
        cost_usd: 0.05,
        duration_ms: 1200,
        num_turns: 2,
      });

      const executePromise = executor.execute('Analyze this codebase');
      emitStreamData(mockProc, [resultLine], null, 0);

      // Act
      const result = await executePromise;

      // Assert
      expect(result.result).toBe('Analysis complete. Found 3 files.');
      expect(result.sessionId).toBe('sess-abc-123');
      // execute() now uses stream-json format internally; prompt is piped via stdin
      expect(mockSpawn).toHaveBeenCalledWith(
        'claude',
        expect.arrayContaining(['-p', '--output-format', 'stream-json']),
        expect.any(Object)
      );
      const spawnArgs = vi.mocked(mockSpawn).mock.calls[0][1] as string[];
      expect(spawnArgs).not.toContain('Analyze this codebase');
    });

    it('should parse session-id from stream result', async () => {
      // Arrange
      const mockProc = createMockChildProcess();
      vi.mocked(mockSpawn).mockReturnValue(mockProc as any);

      const resultLine = buildStreamResult({
        result: 'Done',
        session_id: 'session-xyz-789',
      });

      const executePromise = executor.execute('Do something');
      emitStreamData(mockProc, [resultLine], null, 0);

      // Act
      const result = await executePromise;

      // Assert
      expect(result.sessionId).toBe('session-xyz-789');
    });

    it('should include usage data when present in result', async () => {
      // Arrange
      const mockProc = createMockChildProcess();
      vi.mocked(mockSpawn).mockReturnValue(mockProc as any);

      const resultLine = buildStreamResult({
        result: 'Done',
        session_id: 'sess-1',
        usage: {
          input_tokens: 100,
          output_tokens: 800,
          cache_creation_input_tokens: 1000,
          cache_read_input_tokens: 400,
        },
      });

      const executePromise = executor.execute('Test prompt');
      emitStreamData(mockProc, [resultLine], null, 0);

      // Act
      const result = await executePromise;

      // Assert — input includes cache tokens, cache breakdown preserved
      expect(result.usage).toEqual({
        inputTokens: 1500,
        outputTokens: 800,
        cacheCreationInputTokens: 1000,
        cacheReadInputTokens: 400,
      });
    });

    it('should include usage without cache tokens', async () => {
      const mockProc = createMockChildProcess();
      vi.mocked(mockSpawn).mockReturnValue(mockProc as any);

      const resultLine = buildStreamResult({
        result: 'Done',
        usage: { input_tokens: 500, output_tokens: 200 },
      });

      const executePromise = executor.execute('Test');
      emitStreamData(mockProc, [resultLine], null, 0);

      const result = await executePromise;
      expect(result.usage).toEqual({ inputTokens: 500, outputTokens: 200 });
    });

    it('should extract cost and turns from result line', async () => {
      const mockProc = createMockChildProcess();
      vi.mocked(mockSpawn).mockReturnValue(mockProc as any);

      const resultLine = buildStreamResult({
        result: 'Done',
        usage: { input_tokens: 100, output_tokens: 50 },
        total_cost_usd: 0.1857,
        num_turns: 3,
        duration_api_ms: 5758,
      });

      const executePromise = executor.execute('Test');
      emitStreamData(mockProc, [resultLine], null, 0);

      const result = await executePromise;
      expect(result.usage?.costUsd).toBe(0.1857);
      expect(result.usage?.numTurns).toBe(3);
      expect(result.usage?.durationApiMs).toBe(5758);
    });

    it('should not include usage when usage field is absent', async () => {
      const mockProc = createMockChildProcess();
      vi.mocked(mockSpawn).mockReturnValue(mockProc as any);

      const resultLine = buildStreamResult({ result: 'Done' });

      const executePromise = executor.execute('Test');
      emitStreamData(mockProc, [resultLine], null, 0);

      const result = await executePromise;
      expect(result.usage).toBeUndefined();
    });

    it('should handle subprocess errors gracefully', async () => {
      // Arrange
      const mockProc = createMockChildProcess();
      vi.mocked(mockSpawn).mockReturnValue(mockProc as any);

      const executePromise = executor.execute('Bad prompt');
      emitStreamData(mockProc, [], 'Error: Authentication failed', 1);

      // Act & Assert
      await expect(executePromise).rejects.toThrow('Authentication failed');
    });

    it('should kill subprocess and resolve when result is received but process never exits', async () => {
      // Regression: feature 92701aa8 hung 3+ hours after `[result]` because
      // MCP servers and a leaked `pnpm dev:web` background process kept the
      // claude CLI subprocess alive. The executor must not depend on natural
      // exit — once we have the result, we must enforce a grace period and
      // kill the subprocess so proc.on('close') fires and we resolve.
      vi.useFakeTimers();
      try {
        const mockProc = createMockChildProcess();
        vi.mocked(mockSpawn).mockReturnValue(mockProc as any);

        // Make kill() actually emit close so the executor resolves.
        mockProc.kill.mockImplementation(() => {
          setImmediate(() => {
            mockProc.stdout.end();
            mockProc.stderr.end();
            mockProc.emit('close', null);
          });
          return true;
        });

        const resultLine = buildStreamResult({
          result: 'Implementation complete',
          session_id: 'sess-stuck-1',
        });

        const executePromise = executor.execute('Long-running task');

        // Emit the result line but never close the process (mimicking the
        // real-world hang where MCP children pin the parent open).
        await Promise.resolve();
        mockProc.stdout.write(`${resultLine}\n`);
        await vi.advanceTimersByTimeAsync(0);

        // Before the grace period elapses, kill must NOT have been called.
        expect(mockProc.kill).not.toHaveBeenCalled();

        // Advance past the 30s post-result grace period.
        await vi.advanceTimersByTimeAsync(31_000);

        // Executor must have force-killed the subprocess.
        expect(mockProc.kill).toHaveBeenCalled();

        // And the captured result data must be returned, not lost.
        await vi.runAllTimersAsync();
        const result = await executePromise;
        expect(result.result).toBe('Implementation complete');
        expect(result.sessionId).toBe('sess-stuck-1');
      } finally {
        vi.useRealTimers();
      }
    });

    it('should handle spawn error event', async () => {
      // Arrange
      const mockProc = createMockChildProcess();
      vi.mocked(mockSpawn).mockReturnValue(mockProc as any);

      const executePromise = executor.execute('Test');

      process.nextTick(() => {
        mockProc.emit('error', new Error('spawn claude ENOENT'));
      });

      // Act & Assert
      await expect(executePromise).rejects.toThrow('spawn claude ENOENT');
    });

    it('should pass --resume flag when resumeSession option is set', async () => {
      // Arrange
      const mockProc = createMockChildProcess();
      vi.mocked(mockSpawn).mockReturnValue(mockProc as any);

      const resultLine = buildStreamResult({ result: 'Resumed', session_id: 'sess-resume' });
      const executePromise = executor.execute('Continue work', {
        resumeSession: 'prev-session-id',
      });
      emitStreamData(mockProc, [resultLine], null, 0);

      await executePromise;

      // Assert
      expect(mockSpawn).toHaveBeenCalledWith(
        'claude',
        expect.arrayContaining(['--resume', 'prev-session-id']),
        expect.any(Object)
      );
    });

    it('should pass --model flag when model option is set', async () => {
      // Arrange
      const mockProc = createMockChildProcess();
      vi.mocked(mockSpawn).mockReturnValue(mockProc as any);

      const resultLine = buildStreamResult({ result: 'Done' });
      const executePromise = executor.execute('Test', { model: 'claude-sonnet-4-5-20250929' });
      emitStreamData(mockProc, [resultLine], null, 0);

      await executePromise;

      // Assert
      expect(mockSpawn).toHaveBeenCalledWith(
        'claude',
        expect.arrayContaining(['--model', 'claude-sonnet-4-5-20250929']),
        expect.any(Object)
      );
    });

    it('should pass --append-system-prompt when systemPrompt option is set', async () => {
      // Arrange
      const mockProc = createMockChildProcess();
      vi.mocked(mockSpawn).mockReturnValue(mockProc as any);

      const resultLine = buildStreamResult({ result: 'Done' });
      const executePromise = executor.execute('Test', {
        systemPrompt: 'You are a code reviewer',
      });
      emitStreamData(mockProc, [resultLine], null, 0);

      await executePromise;

      // Assert
      expect(mockSpawn).toHaveBeenCalledWith(
        'claude',
        expect.arrayContaining(['--append-system-prompt', 'You are a code reviewer']),
        expect.any(Object)
      );
    });

    it('should pass --allowedTools when allowedTools option is set', async () => {
      // Arrange
      const mockProc = createMockChildProcess();
      vi.mocked(mockSpawn).mockReturnValue(mockProc as any);

      const resultLine = buildStreamResult({ result: 'Done' });
      const executePromise = executor.execute('Test', {
        allowedTools: ['Read', 'Write', 'Bash'],
      });
      emitStreamData(mockProc, [resultLine], null, 0);

      await executePromise;

      // Assert
      expect(mockSpawn).toHaveBeenCalledWith(
        'claude',
        expect.arrayContaining(['--allowedTools', 'Read,Write,Bash']),
        expect.any(Object)
      );
    });

    it('should pass --max-turns when maxTurns option is set', async () => {
      // Arrange
      const mockProc = createMockChildProcess();
      vi.mocked(mockSpawn).mockReturnValue(mockProc as any);

      const resultLine = buildStreamResult({ result: 'Done' });
      const executePromise = executor.execute('Test', { maxTurns: 5 });
      emitStreamData(mockProc, [resultLine], null, 0);

      await executePromise;

      // Assert
      expect(mockSpawn).toHaveBeenCalledWith(
        'claude',
        expect.arrayContaining(['--max-turns', '5']),
        expect.any(Object)
      );
    });

    it('should pass --json-schema when outputSchema option is set', async () => {
      // Arrange
      const mockProc = createMockChildProcess();
      vi.mocked(mockSpawn).mockReturnValue(mockProc as any);

      const schema = { type: 'object', properties: { summary: { type: 'string' } } };
      const resultLine = buildStreamResult({ result: '{"summary":"test"}' });
      const executePromise = executor.execute('Test', { outputSchema: schema });
      emitStreamData(mockProc, [resultLine], null, 0);

      await executePromise;

      // Assert
      expect(mockSpawn).toHaveBeenCalledWith(
        'claude',
        expect.arrayContaining(['--json-schema', JSON.stringify(schema)]),
        expect.any(Object)
      );
    });

    it('should NOT set shell option in spawn options', async () => {
      // shell: true on Windows causes DEP0190 and mangles long prompts
      const mockProc = createMockChildProcess();
      vi.mocked(mockSpawn).mockReturnValue(mockProc as any);

      const resultLine = buildStreamResult({ result: 'Done' });
      const executePromise = executor.execute('Test');
      emitStreamData(mockProc, [resultLine], null, 0);

      await executePromise;

      const spawnOpts = vi.mocked(mockSpawn).mock.calls[0][2] as Record<string, unknown>;
      expect(spawnOpts).not.toHaveProperty('shell');
    });

    it('should pass cwd option to spawn', async () => {
      // Arrange
      const mockProc = createMockChildProcess();
      vi.mocked(mockSpawn).mockReturnValue(mockProc as any);

      const resultLine = buildStreamResult({ result: 'Done' });
      const executePromise = executor.execute('Test', { cwd: '/some/project' });
      emitStreamData(mockProc, [resultLine], null, 0);

      await executePromise;

      // Assert
      expect(mockSpawn).toHaveBeenCalledWith(
        'claude',
        expect.any(Array),
        expect.objectContaining({ cwd: '/some/project' })
      );
    });

    it('should apply timeout and kill subprocess', async () => {
      // Arrange
      vi.useFakeTimers();
      const mockProc = createMockChildProcess();
      vi.mocked(mockSpawn).mockReturnValue(mockProc as any);

      const executePromise = executor.execute('Long running', { timeout: 5000 });

      // Advance timer past timeout
      vi.advanceTimersByTime(5001);

      // The process should be killed after timeout; emit close
      mockProc.stdout.end();
      mockProc.stderr.end();
      mockProc.emit('close', null);

      // Act & Assert
      await expect(executePromise).rejects.toThrow(/timed out/i);
      expect(mockProc.kill).toHaveBeenCalled();
      vi.useRealTimers();
    });

    it('should handle empty result gracefully', async () => {
      // Arrange — no result line emitted, just a close
      const mockProc = createMockChildProcess();
      vi.mocked(mockSpawn).mockReturnValue(mockProc as any);

      const executePromise = executor.execute('Test');
      emitStreamData(mockProc, [], null, 0);

      // Act
      const result = await executePromise;

      // Assert — empty result, no crash
      expect(result.result).toBe('');
      expect(result.sessionId).toBeUndefined();
    });

    it('should log tool calls from assistant messages in stream', async () => {
      // Arrange
      const mockProc = createMockChildProcess();
      vi.mocked(mockSpawn).mockReturnValue(mockProc as any);

      const assistantLine = JSON.stringify({
        type: 'assistant',
        message: {
          content: [
            { type: 'tool_use', name: 'Read', input: { file_path: '/src/index.ts' } },
            { type: 'text', text: 'Let me read the file...' },
          ],
        },
      });
      const resultLine = buildStreamResult({ result: 'Done', session_id: 'sess-1' });

      const executePromise = executor.execute('Test');
      emitStreamData(mockProc, [assistantLine, resultLine], null, 0);

      // Act
      const result = await executePromise;

      // Assert — tool events were processed, result still correct
      expect(result.result).toBe('Done');
      expect(result.sessionId).toBe('sess-1');
    });

    it('should store metadata from result line', async () => {
      // Arrange
      const mockProc = createMockChildProcess();
      vi.mocked(mockSpawn).mockReturnValue(mockProc as any);

      const resultLine = buildStreamResult({
        result: 'Done',
        session_id: 'sess-1',
        usage: { input_tokens: 100, output_tokens: 50 },
        cost_usd: 0.01,
        num_turns: 1,
      });

      const executePromise = executor.execute('Test');
      emitStreamData(mockProc, [resultLine], null, 0);

      // Act
      const result = await executePromise;

      // Assert
      expect(result.metadata).toEqual(expect.objectContaining({ cost_usd: 0.01, num_turns: 1 }));
    });

    describe('disableMcp option', () => {
      it('should add --strict-mcp-config when disableMcp is true', async () => {
        const mockProc = createMockChildProcess();
        vi.mocked(mockSpawn).mockReturnValue(mockProc as any);
        const resultLine = buildStreamResult({ result: 'Done' });
        const executePromise = executor.execute('Test', { disableMcp: true });
        emitStreamData(mockProc, [resultLine], null, 0);
        await executePromise;
        expect(mockSpawn).toHaveBeenCalledWith(
          'claude',
          expect.arrayContaining(['--strict-mcp-config']),
          expect.any(Object)
        );
      });

      it('should NOT add --strict-mcp-config when disableMcp is false', async () => {
        const mockProc = createMockChildProcess();
        vi.mocked(mockSpawn).mockReturnValue(mockProc as any);
        const resultLine = buildStreamResult({ result: 'Done' });
        const executePromise = executor.execute('Test', { disableMcp: false });
        emitStreamData(mockProc, [resultLine], null, 0);
        await executePromise;
        const args = vi.mocked(mockSpawn).mock.calls[0][1] as string[];
        expect(args).not.toContain('--strict-mcp-config');
      });

      it('should NOT add --strict-mcp-config when disableMcp is undefined', async () => {
        const mockProc = createMockChildProcess();
        vi.mocked(mockSpawn).mockReturnValue(mockProc as any);
        const resultLine = buildStreamResult({ result: 'Done' });
        const executePromise = executor.execute('Test', {});
        emitStreamData(mockProc, [resultLine], null, 0);
        await executePromise;
        const args = vi.mocked(mockSpawn).mock.calls[0][1] as string[];
        expect(args).not.toContain('--strict-mcp-config');
      });
    });

    describe('tools option', () => {
      it('should add --tools with comma-separated values when tools provided', async () => {
        const mockProc = createMockChildProcess();
        vi.mocked(mockSpawn).mockReturnValue(mockProc as any);
        const resultLine = buildStreamResult({ result: 'Done' });
        const executePromise = executor.execute('Test', { tools: ['Bash', 'Read', 'Write'] });
        emitStreamData(mockProc, [resultLine], null, 0);
        await executePromise;
        expect(mockSpawn).toHaveBeenCalledWith(
          'claude',
          expect.arrayContaining(['--tools', 'Bash,Read,Write']),
          expect.any(Object)
        );
      });

      it('should NOT add --tools when tools is undefined', async () => {
        const mockProc = createMockChildProcess();
        vi.mocked(mockSpawn).mockReturnValue(mockProc as any);
        const resultLine = buildStreamResult({ result: 'Done' });
        const executePromise = executor.execute('Test', {});
        emitStreamData(mockProc, [resultLine], null, 0);
        await executePromise;
        const args = vi.mocked(mockSpawn).mock.calls[0][1] as string[];
        expect(args).not.toContain('--tools');
      });

      it('should NOT add --tools when tools array is empty', async () => {
        const mockProc = createMockChildProcess();
        vi.mocked(mockSpawn).mockReturnValue(mockProc as any);
        const resultLine = buildStreamResult({ result: 'Done' });
        const executePromise = executor.execute('Test', { tools: [] });
        emitStreamData(mockProc, [resultLine], null, 0);
        await executePromise;
        const args = vi.mocked(mockSpawn).mock.calls[0][1] as string[];
        expect(args).not.toContain('--tools');
      });
    });
  });

  describe('executeStream', () => {
    it('should stream execution events', async () => {
      // Arrange
      const mockProc = createMockChildProcess();
      vi.mocked(mockSpawn).mockReturnValue(mockProc as any);

      const events: { type: string; content: string }[] = [];

      const streamPromise = (async () => {
        for await (const event of executor.executeStream('Implement feature')) {
          events.push({ type: event.type, content: event.content });
          if (event.type === 'result') break;
        }
      })();

      // Simulate streaming output (one JSON object per line)
      const progressEvent = JSON.stringify({
        type: 'assistant',
        message: { content: [{ type: 'text', text: 'Working on it...' }] },
      });
      const resultEvent = JSON.stringify({
        type: 'result',
        result: 'Feature implemented',
        session_id: 'sess-stream',
      });

      // Push events with small delays to allow async iteration
      await new Promise((r) => setTimeout(r, 10));
      mockProc.stdout.write(`${progressEvent}\n`);
      await new Promise((r) => setTimeout(r, 10));
      mockProc.stdout.write(`${resultEvent}\n`);
      await new Promise((r) => setTimeout(r, 10));
      mockProc.stdout.end();
      mockProc.stderr.end();
      mockProc.emit('close', 0);

      await streamPromise;

      // Assert
      expect(events.length).toBeGreaterThanOrEqual(1);
      expect(mockSpawn).toHaveBeenCalledWith(
        'claude',
        expect.arrayContaining(['--output-format', 'stream-json']),
        expect.any(Object)
      );
    });

    it('should yield error events on subprocess failure', async () => {
      // Arrange
      const mockProc = createMockChildProcess();
      vi.mocked(mockSpawn).mockReturnValue(mockProc as any);

      const events: { type: string; content: string }[] = [];

      const streamPromise = (async () => {
        for await (const event of executor.executeStream('Bad prompt')) {
          events.push({ type: event.type, content: event.content });
        }
      })();

      await new Promise((r) => setTimeout(r, 10));
      mockProc.stderr.write('Fatal error occurred');
      mockProc.stdout.end();
      mockProc.stderr.end();
      mockProc.emit('close', 1);

      await streamPromise;

      // Assert
      const errorEvents = events.filter((e) => e.type === 'error');
      expect(errorEvents.length).toBeGreaterThanOrEqual(1);
      expect(errorEvents[0].content).toContain('Fatal error occurred');
    });

    it('should include timestamps on all events', async () => {
      // Arrange
      const mockProc = createMockChildProcess();
      vi.mocked(mockSpawn).mockReturnValue(mockProc as any);

      const events: { type: string; timestamp: Date }[] = [];

      const streamPromise = (async () => {
        for await (const event of executor.executeStream('Test')) {
          events.push({ type: event.type, timestamp: event.timestamp });
        }
      })();

      const resultEvent = JSON.stringify({
        type: 'result',
        result: 'Done',
      });

      await new Promise((r) => setTimeout(r, 10));
      mockProc.stdout.write(`${resultEvent}\n`);
      await new Promise((r) => setTimeout(r, 10));
      mockProc.stdout.end();
      mockProc.stderr.end();
      mockProc.emit('close', 0);

      await streamPromise;

      // Assert
      for (const event of events) {
        expect(event.timestamp).toBeInstanceOf(Date);
      }
    });
  });

  // -------------------------------------------------------------------------
  // ENOENT error handling (#356 — meaningful error when CLI not found)
  // -------------------------------------------------------------------------

  describe('ENOENT error handling', () => {
    it('should reject with user-friendly error when claude CLI is not found', async () => {
      const mockProc = createMockChildProcess();
      const mockSpawn = vi.fn().mockReturnValue(mockProc) as unknown as SpawnFunction;
      const executor = new ClaudeCodeExecutorService(mockSpawn);

      const promise = executor.execute('test prompt');

      // Simulate ENOENT error from spawn
      const enoentError = new Error('spawn claude ENOENT') as Error & { code: string };
      enoentError.code = 'ENOENT';
      mockProc.emit('error', enoentError);

      await expect(promise).rejects.toThrow(/Claude Code CLI.*not found/);
    });

    it('should pass through non-ENOENT errors unchanged', async () => {
      const mockProc = createMockChildProcess();
      const mockSpawn = vi.fn().mockReturnValue(mockProc) as unknown as SpawnFunction;
      const executor = new ClaudeCodeExecutorService(mockSpawn);

      const promise = executor.execute('test prompt');

      mockProc.emit('error', new Error('some other error'));

      await expect(promise).rejects.toThrow('some other error');
    });
  });
});
