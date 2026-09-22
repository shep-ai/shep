/**
 * GeminiCliExecutorService Unit Tests
 *
 * Tests for the Gemini CLI subprocess executor service.
 * Uses constructor-injected spawn function mock (NOT vi.mock of child_process).
 *
 * TDD Phase: RED-GREEN
 */

import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { GeminiCliExecutorService } from '@/infrastructure/services/agents/common/executors/gemini-cli-executor.service.js';
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

/** Build a complete Gemini JSON response */
function buildGeminiJsonResponse(response: string, sessionId?: string, stats?: object): string {
  return JSON.stringify({
    response,
    ...(sessionId ? { session_id: sessionId } : {}),
    ...(stats ? { stats } : {}),
  });
}

/** Emit a single JSON response followed by close */
function emitStreamData(
  proc: ReturnType<typeof createMockChildProcess>,
  data: string | null,
  stderrData: string | null,
  exitCode: number | null
) {
  process.nextTick(() => {
    if (data !== null) proc.stdout.write(data);
    proc.stdout.end();
    if (stderrData !== null) proc.stderr.write(stderrData);
    proc.stderr.end();
    proc.emit('close', exitCode);
  });
}

describe('GeminiCliExecutorService', () => {
  let mockSpawn: SpawnFunction;
  let executor: GeminiCliExecutorService;

  beforeEach(() => {
    mockSpawn = vi.fn();
    executor = new GeminiCliExecutorService(mockSpawn);
  });

  // A fake-timer test that fails before its own `useRealTimers()` must not
  // leave every later test waiting on timers that never advance.
  afterEach(() => {
    vi.useRealTimers();
  });

  describe('agentType', () => {
    it('should have agentType of GeminiCli', () => {
      expect(executor.agentType).toBe(AgentType.GeminiCli);
    });
  });

  describe('supportsFeature', () => {
    it('should support session-resume feature', () => {
      expect(executor.supportsFeature(AgentFeature.sessionResume)).toBe(true);
    });

    it('should support streaming feature', () => {
      expect(executor.supportsFeature(AgentFeature.streaming)).toBe(true);
    });

    it('should support tool-scoping feature', () => {
      expect(executor.supportsFeature(AgentFeature.toolScoping)).toBe(true);
    });

    it('should NOT support structured-output feature', () => {
      expect(executor.supportsFeature(AgentFeature.structuredOutput)).toBe(false);
    });

    it('should NOT support system-prompt feature', () => {
      expect(executor.supportsFeature(AgentFeature.systemPrompt)).toBe(false);
    });

    it('should NOT support session-listing feature', () => {
      expect(executor.supportsFeature(AgentFeature.sessionListing)).toBe(false);
    });
  });

  describe('execute', () => {
    it('should execute prompt and return parsed result from JSON response field', async () => {
      const mockProc = createMockChildProcess();
      vi.mocked(mockSpawn).mockReturnValue(mockProc as any);

      const jsonOutput = buildGeminiJsonResponse('Analysis complete. Found 3 files.');
      const executePromise = executor.execute('Analyze this codebase', { silent: true });
      emitStreamData(mockProc, jsonOutput, null, 0);

      const result = await executePromise;

      expect(result.result).toBe('Analysis complete. Found 3 files.');
      // Prompt is piped via stdin, not passed as a CLI argument
      expect(mockSpawn).toHaveBeenCalledWith(
        'gemini',
        expect.arrayContaining(['-p', '--output-format', 'json', '-y']),
        expect.any(Object)
      );
      const spawnArgs = vi.mocked(mockSpawn).mock.calls[0][1] as string[];
      expect(spawnArgs).not.toContain('Analyze this codebase');
    });

    it('should extract sessionId from session_id field', async () => {
      const mockProc = createMockChildProcess();
      vi.mocked(mockSpawn).mockReturnValue(mockProc as any);

      const jsonOutput = buildGeminiJsonResponse('Done', 'session-xyz-789');
      const executePromise = executor.execute('Do something', { silent: true });
      emitStreamData(mockProc, jsonOutput, null, 0);

      const result = await executePromise;

      expect(result.sessionId).toBe('session-xyz-789');
    });

    it('should extract usage from stats.models tokens', async () => {
      const mockProc = createMockChildProcess();
      vi.mocked(mockSpawn).mockReturnValue(mockProc as any);

      const stats = {
        models: {
          'gemini-2.5-pro': {
            tokens: { prompt: 150, candidates: 250 },
          },
        },
      };
      const jsonOutput = buildGeminiJsonResponse('Done', 'sess-1', stats);
      const executePromise = executor.execute('Test', { silent: true });
      emitStreamData(mockProc, jsonOutput, null, 0);

      const result = await executePromise;

      expect(result.usage).toEqual({ inputTokens: 150, outputTokens: 250 });
    });

    it('should return undefined usage when stats are missing', async () => {
      const mockProc = createMockChildProcess();
      vi.mocked(mockSpawn).mockReturnValue(mockProc as any);

      const jsonOutput = buildGeminiJsonResponse('Done', 'sess-1');
      const executePromise = executor.execute('Test', { silent: true });
      emitStreamData(mockProc, jsonOutput, null, 0);

      const result = await executePromise;

      expect(result.usage).toBeUndefined();
    });

    it('should return undefined sessionId when session_id is missing', async () => {
      const mockProc = createMockChildProcess();
      vi.mocked(mockSpawn).mockReturnValue(mockProc as any);

      const jsonOutput = buildGeminiJsonResponse('Done');
      const executePromise = executor.execute('Test', { silent: true });
      emitStreamData(mockProc, jsonOutput, null, 0);

      const result = await executePromise;

      expect(result.sessionId).toBeUndefined();
    });

    it('should set GEMINI_API_KEY when authConfig uses token auth', async () => {
      const authConfig: AgentConfig = {
        type: AgentType.GeminiCli,
        authMethod: 'token' as any,
        token: 'my-api-key-123',
      };
      const tokenExecutor = new GeminiCliExecutorService(mockSpawn, authConfig);
      const mockProc = createMockChildProcess();
      vi.mocked(mockSpawn).mockReturnValue(mockProc as any);

      const jsonOutput = buildGeminiJsonResponse('Done');
      const executePromise = tokenExecutor.execute('Test', { silent: true });
      emitStreamData(mockProc, jsonOutput, null, 0);

      await executePromise;

      const spawnOpts = vi.mocked(mockSpawn).mock.calls[0][2] as Record<string, unknown>;
      const env = spawnOpts.env as Record<string, string>;
      expect(env.GEMINI_API_KEY).toBe('my-api-key-123');
    });

    it('should NOT set GEMINI_API_KEY when authConfig uses session auth', async () => {
      // Ensure no pre-existing GEMINI_API_KEY leaks from the real environment
      const originalKey = process.env.GEMINI_API_KEY;
      delete process.env.GEMINI_API_KEY;

      const authConfig: AgentConfig = {
        type: AgentType.GeminiCli,
        authMethod: 'session' as any,
      };
      const sessionExecutor = new GeminiCliExecutorService(mockSpawn, authConfig);
      const mockProc = createMockChildProcess();
      vi.mocked(mockSpawn).mockReturnValue(mockProc as any);

      const jsonOutput = buildGeminiJsonResponse('Done');
      const executePromise = sessionExecutor.execute('Test', { silent: true });
      emitStreamData(mockProc, jsonOutput, null, 0);

      await executePromise;

      const spawnOpts = vi.mocked(mockSpawn).mock.calls[0][2] as Record<string, unknown>;
      const env = spawnOpts.env as Record<string, string>;
      expect(env.GEMINI_API_KEY).toBeUndefined();

      // Restore
      if (originalKey !== undefined) process.env.GEMINI_API_KEY = originalKey;
    });

    it('should strip CLAUDECODE from spawn env', async () => {
      const originalEnv = process.env.CLAUDECODE;
      process.env.CLAUDECODE = 'some-value';

      const mockProc = createMockChildProcess();
      vi.mocked(mockSpawn).mockReturnValue(mockProc as any);

      const jsonOutput = buildGeminiJsonResponse('Done');
      const executePromise = executor.execute('Test', { silent: true });
      emitStreamData(mockProc, jsonOutput, null, 0);

      await executePromise;

      const spawnOpts = vi.mocked(mockSpawn).mock.calls[0][2] as Record<string, unknown>;
      const env = spawnOpts.env as Record<string, string>;
      expect(env.CLAUDECODE).toBeUndefined();

      // Restore
      if (originalEnv !== undefined) process.env.CLAUDECODE = originalEnv;
      else delete process.env.CLAUDECODE;
    });

    it('should pass cwd option to spawn', async () => {
      const mockProc = createMockChildProcess();
      vi.mocked(mockSpawn).mockReturnValue(mockProc as any);

      const jsonOutput = buildGeminiJsonResponse('Done');
      const executePromise = executor.execute('Test', { cwd: '/some/project', silent: true });
      emitStreamData(mockProc, jsonOutput, null, 0);

      await executePromise;

      expect(mockSpawn).toHaveBeenCalledWith(
        'gemini',
        expect.any(Array),
        expect.objectContaining({ cwd: '/some/project' })
      );
    });

    it('should include basic args: -p, --output-format json, -y', async () => {
      const mockProc = createMockChildProcess();
      vi.mocked(mockSpawn).mockReturnValue(mockProc as any);

      const jsonOutput = buildGeminiJsonResponse('Done');
      const executePromise = executor.execute('My prompt', { silent: true });
      emitStreamData(mockProc, jsonOutput, null, 0);

      await executePromise;

      const spawnArgs = vi.mocked(mockSpawn).mock.calls[0][1];
      expect(spawnArgs).toContain('-p');
      // Prompt is piped via stdin, not in args
      expect(spawnArgs).not.toContain('My prompt');
      expect(spawnArgs).toContain('--output-format');
      expect(spawnArgs).toContain('json');
      expect(spawnArgs).toContain('-y');
    });

    it('should include --resume when resumeSession is provided', async () => {
      const mockProc = createMockChildProcess();
      vi.mocked(mockSpawn).mockReturnValue(mockProc as any);

      const jsonOutput = buildGeminiJsonResponse('Resumed');
      const executePromise = executor.execute('Continue work', {
        resumeSession: 'prev-session-id',
        silent: true,
      });
      emitStreamData(mockProc, jsonOutput, null, 0);

      await executePromise;

      expect(mockSpawn).toHaveBeenCalledWith(
        'gemini',
        expect.arrayContaining(['--resume', 'prev-session-id']),
        expect.any(Object)
      );
    });

    it('should include -m when model is provided', async () => {
      const mockProc = createMockChildProcess();
      vi.mocked(mockSpawn).mockReturnValue(mockProc as any);

      const jsonOutput = buildGeminiJsonResponse('Done');
      const executePromise = executor.execute('Test', { model: 'gemini-2.5-pro', silent: true });
      emitStreamData(mockProc, jsonOutput, null, 0);

      await executePromise;

      expect(mockSpawn).toHaveBeenCalledWith(
        'gemini',
        expect.arrayContaining(['-m', 'gemini-2.5-pro']),
        expect.any(Object)
      );
    });

    it('should include --allowed-tools with comma-separated tools', async () => {
      const mockProc = createMockChildProcess();
      vi.mocked(mockSpawn).mockReturnValue(mockProc as any);

      const jsonOutput = buildGeminiJsonResponse('Done');
      const executePromise = executor.execute('Test', {
        allowedTools: ['Read', 'Write', 'Shell'],
        silent: true,
      });
      emitStreamData(mockProc, jsonOutput, null, 0);

      await executePromise;

      expect(mockSpawn).toHaveBeenCalledWith(
        'gemini',
        expect.arrayContaining(['--allowed-tools', 'Read,Write,Shell']),
        expect.any(Object)
      );
    });

    it('should NOT include unsupported options in args', async () => {
      const mockProc = createMockChildProcess();
      vi.mocked(mockSpawn).mockReturnValue(mockProc as any);

      const jsonOutput = buildGeminiJsonResponse('Done');
      const executePromise = executor.execute('Test', {
        systemPrompt: 'You are a code reviewer',
        outputSchema: { type: 'object' },
        maxTurns: 5,
        disableMcp: true,
        silent: true,
      });
      emitStreamData(mockProc, jsonOutput, null, 0);

      await executePromise;

      const spawnArgs = vi.mocked(mockSpawn).mock.calls[0][1];
      expect(spawnArgs).not.toContain('--append-system-prompt');
      expect(spawnArgs).not.toContain('--system-prompt');
      expect(spawnArgs).not.toContain('--output-schema');
      expect(spawnArgs).not.toContain('--max-turns');
      expect(spawnArgs).not.toContain('--strict-mcp-config');
    });

    it('should reject with error including code and stderr on non-zero exit', async () => {
      const mockProc = createMockChildProcess();
      vi.mocked(mockSpawn).mockReturnValue(mockProc as any);

      const executePromise = executor.execute('Bad prompt', { silent: true });
      emitStreamData(mockProc, null, 'Error: Authentication failed', 1);

      await expect(executePromise).rejects.toThrow('Process exited with code 1');
    });

    it('should include stderr in error message on non-zero exit', async () => {
      const mockProc = createMockChildProcess();
      vi.mocked(mockSpawn).mockReturnValue(mockProc as any);

      const executePromise = executor.execute('Bad prompt', { silent: true });
      emitStreamData(mockProc, null, 'Authentication failed', 1);

      await expect(executePromise).rejects.toThrow('Authentication failed');
    });

    it('should reject with error on invalid JSON output', async () => {
      const mockProc = createMockChildProcess();
      vi.mocked(mockSpawn).mockReturnValue(mockProc as any);

      const executePromise = executor.execute('Test', { silent: true });
      emitStreamData(mockProc, 'not valid json at all', null, 0);

      await expect(executePromise).rejects.toThrow(/Failed to parse Gemini JSON output/);
    });

    it('should keep the answer when a 429 was retried and the retry succeeded', async () => {
      const mockProc = createMockChildProcess();
      vi.mocked(mockSpawn).mockReturnValue(mockProc as any);

      // "Attempt N failed ... Retrying" is what the CLI prints when it RETRIES.
      // A retry that then succeeds ends with exit 0 and a full response, so
      // treating the notice itself as fatal threw away completed work.
      const stderrOutput =
        'Attempt 1 failed with status 429. Retrying with backoff... GaxiosError: [{\n' +
        '  "error": { "code": 429, "message": "No capacity available for model gemini-3-flash-preview on the server" }\n' +
        '}]';
      const jsonOutput = buildGeminiJsonResponse('Some partial response');
      const executePromise = executor.execute('Test', { silent: true });
      emitStreamData(mockProc, jsonOutput, stderrOutput, 0);

      expect((await executePromise).result).toBe('Some partial response');
    });

    it('should keep the answer even when stderr mentions RESOURCE_EXHAUSTED', async () => {
      const mockProc = createMockChildProcess();
      vi.mocked(mockSpawn).mockReturnValue(mockProc as any);

      // Exit 0 plus a complete response IS the agent's answer; quota noise from
      // a call the CLI recovered from must not discard it.
      const stderrOutput = '"status": "RESOURCE_EXHAUSTED"';
      const jsonOutput = buildGeminiJsonResponse('Partial');
      const executePromise = executor.execute('Test', { silent: true });
      emitStreamData(mockProc, jsonOutput, stderrOutput, 0);

      expect((await executePromise).result).toBe('Partial');
    });

    it('should reject with the stderr diagnosis when exit 0 produced no answer', async () => {
      const mockProc = createMockChildProcess();
      vi.mocked(mockSpawn).mockReturnValue(mockProc as any);

      const executePromise = executor.execute('Test', { silent: true });
      emitStreamData(mockProc, buildGeminiJsonResponse(''), '"status": "RESOURCE_EXHAUSTED"', 0);

      await expect(executePromise).rejects.toThrow(/RESOURCE_EXHAUSTED/);
    });

    it('should NOT reject for non-fatal stderr messages with exit code 0', async () => {
      const mockProc = createMockChildProcess();
      vi.mocked(mockSpawn).mockReturnValue(mockProc as any);

      // YOLO mode and skill conflict are benign stderr messages
      const stderrOutput =
        'YOLO mode is enabled. All tool calls will be automatically approved.\n' +
        'Skill conflict detected: "find-skills"';
      const jsonOutput = buildGeminiJsonResponse('Success!');
      const executePromise = executor.execute('Test', { silent: true });
      emitStreamData(mockProc, jsonOutput, stderrOutput, 0);

      const result = await executePromise;
      expect(result.result).toBe('Success!');
    });

    it('should handle spawn error event (ENOENT)', async () => {
      const mockProc = createMockChildProcess();
      vi.mocked(mockSpawn).mockReturnValue(mockProc as any);

      const executePromise = executor.execute('Test', { silent: true });

      process.nextTick(() => {
        mockProc.emit('error', new Error('spawn gemini ENOENT'));
      });

      await expect(executePromise).rejects.toThrow('spawn gemini ENOENT');
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
  });

  describe('executeStream', () => {
    const tick = () => new Promise((r) => setTimeout(r, 10));
    const ev = (type: string, data: Record<string, unknown>) => JSON.stringify({ type, ...data });

    /** Collect all stream events, writing stdout lines and closing the process */
    async function streamWith(
      exec: GeminiCliExecutorService,
      opts: {
        lines?: string[];
        stderrData?: string;
        exitCode?: number;
        execOpts?: Parameters<GeminiCliExecutorService['executeStream']>[1];
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

    it('should stream assistant delta messages as progress events', async () => {
      const events = await streamWith(executor, {
        lines: [ev('message', { role: 'assistant', content: 'Working...', delta: true })],
      });
      expect(events).toContainEqual({ type: 'progress', content: 'Working...' });
    });

    it('should stream result event with response', async () => {
      const events = await streamWith(executor, {
        lines: [ev('result', { response: 'All done!' })],
      });
      expect(events).toContainEqual({ type: 'result', content: 'All done!' });
    });

    it('should skip init events', async () => {
      const events = await streamWith(executor, {
        lines: [ev('init', { session_id: 'abc' }), ev('result', { response: 'Done' })],
      });
      expect(events).toHaveLength(1);
      expect(events[0].content).toBe('Done');
    });

    it('should skip user message events', async () => {
      const events = await streamWith(executor, {
        lines: [
          ev('message', { role: 'user', content: 'echoed' }),
          ev('result', { response: 'Done' }),
        ],
      });
      expect(events).toHaveLength(1);
      expect(events).not.toContainEqual(expect.objectContaining({ content: 'echoed' }));
    });

    it('should yield tool_use as progress with formatted name', async () => {
      const events = await streamWith(executor, {
        lines: [ev('tool_use', { tool_name: 'read_file' })],
      });
      expect(events).toContainEqual({ type: 'progress', content: '[tool_use: read_file]' });
    });

    it('should yield tool_result as progress with formatted status', async () => {
      const events = await streamWith(executor, {
        lines: [ev('tool_result', { status: 'success' })],
      });
      expect(events).toContainEqual({ type: 'progress', content: '[tool_result: success]' });
    });

    it('should yield error event from stream', async () => {
      const events = await streamWith(executor, {
        lines: [ev('error', { message: 'Rate limited' })],
      });
      expect(events).toContainEqual({ type: 'error', content: 'Rate limited' });
    });

    it('should skip unknown event types gracefully', async () => {
      const events = await streamWith(executor, {
        lines: [ev('heartbeat', { ts: 123 }), ev('result', { response: 'Done' })],
      });
      expect(events).toHaveLength(1);
      expect(events[0]).toEqual({ type: 'result', content: 'Done' });
    });

    it('should yield non-JSON lines as raw progress', async () => {
      const events = await streamWith(executor, { lines: ['Loading model weights...'] });
      expect(events).toContainEqual({ type: 'progress', content: 'Loading model weights...' });
    });

    it('should emit error event on non-zero exit code', async () => {
      const events = await streamWith(executor, { stderrData: 'Auth error', exitCode: 1 });
      expect(events).toContainEqual(
        expect.objectContaining({ type: 'error', content: expect.stringContaining('Auth error') })
      );
    });

    it('should emit error event on spawn error', async () => {
      const events = await streamWith(executor, { emitError: new Error('spawn gemini ENOENT') });
      expect(events).toContainEqual({ type: 'error', content: 'spawn gemini ENOENT' });
    });

    it('should emit error event when stderr contains fatal API errors despite exit code 0', async () => {
      const events = await streamWith(executor, {
        stderrData:
          'Attempt 1 failed with status 429. Retrying with backoff... "status": "RESOURCE_EXHAUSTED"',
        exitCode: 0,
      });
      expect(events).toContainEqual(
        expect.objectContaining({ type: 'error', content: expect.stringContaining('fatal') })
      );
    });

    it('should include --resume and stream-json format in args', async () => {
      await streamWith(executor, { execOpts: { resumeSession: 'session-abc' } });
      expect(mockSpawn).toHaveBeenCalledWith(
        'gemini',
        expect.arrayContaining(['--resume', 'session-abc', '--output-format', 'stream-json']),
        expect.any(Object)
      );
    });

    it('should set GEMINI_API_KEY when using token auth in streaming', async () => {
      const authConfig: AgentConfig = {
        type: AgentType.GeminiCli,
        authMethod: 'token' as any,
        token: 'stream-key-456',
      };
      const tokenExecutor = new GeminiCliExecutorService(mockSpawn, authConfig);
      await streamWith(tokenExecutor, {});
      const spawnOpts = vi.mocked(mockSpawn).mock.calls[0][2] as Record<string, unknown>;
      expect((spawnOpts.env as Record<string, string>).GEMINI_API_KEY).toBe('stream-key-456');
    });
  });
  // --- defects proven by audit: UTF-8, stdin, policy, stream lifetime ---

  describe('multi-byte output', () => {
    it('should not corrupt a character split across two stdout chunks', async () => {
      const mockProc = createMockChildProcess();
      vi.mocked(mockSpawn).mockReturnValue(mockProc as any);

      const answer = 'héllo — ✅ 日本語 🚀 done';
      const payload = Buffer.from(buildGeminiJsonResponse(answer), 'utf8');
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

      // A stream 'error' with no listener reaches uncaughtException and kills
      // the whole worker instead of failing this one run.
      expect(() =>
        mockProc.stdin.emit('error', Object.assign(new Error('write EPIPE'), { code: 'EPIPE' }))
      ).not.toThrow();

      emitStreamData(mockProc, null, 'agent died', 1);
      await expect(executePromise).rejects.toThrow(/agent died/);
    });
  });

  describe('signal termination', () => {
    it('should name the signal when the CLI is killed with nothing on stdout', async () => {
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
        mockProc.stdout.write(`${JSON.stringify({ type: 'tool_use', tool_name: 'read' })}\n`);
      });

      for await (const _event of gen) {
        break;
      }

      expect(mockProc.kill).toHaveBeenCalled();
    });

    it('should stringify a structured error payload instead of dropping it', async () => {
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
      expect(errorEvent?.content).toContain('upstream boom');
    });
  });
});
