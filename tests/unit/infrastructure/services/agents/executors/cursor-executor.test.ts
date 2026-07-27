/**
 * CursorExecutorService Unit Tests
 *
 * Tests for the Cursor CLI subprocess executor service.
 * Uses constructor-injected spawn function mock (NOT vi.mock of child_process).
 *
 * TDD Phase: RED-GREEN
 */

import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';

// Mock the platform module so IS_WINDOWS re-evaluates per-test
// when process.platform is overridden via Object.defineProperty.
vi.mock('@/infrastructure/platform.js', () => ({
  get IS_WINDOWS() {
    return process.platform === 'win32';
  },
}));

import { CursorExecutorService } from '@/infrastructure/services/agents/common/executors/cursor-executor.service.js';
import type { SpawnFunction } from '@/infrastructure/services/agents/common/types.js';
import { AgentType, AgentFeature } from '@/domain/generated/output.js';

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

/** Build a Cursor assistant event (text content) */
function buildCursorAssistantEvent(text: string, sessionId?: string): string {
  return JSON.stringify({
    type: 'assistant',
    message: { content: [{ type: 'text', text }] },
    ...(sessionId ? { session_id: sessionId } : {}),
  });
}

/** Build a Cursor result event */
function buildCursorResultEvent(
  sessionId: string,
  durationMs: number,
  extra?: Record<string, unknown>
): string {
  return JSON.stringify({
    type: 'result',
    session_id: sessionId,
    duration_ms: durationMs,
    ...extra,
  });
}

/** Build a Cursor tool_call event */
function buildCursorToolCallEvent(
  subtype: 'started' | 'completed',
  toolName: string,
  extra?: Record<string, unknown>
): string {
  return JSON.stringify({
    type: 'tool_call',
    subtype,
    [toolName]: {},
    ...(extra ?? {}),
  });
}

/** Build a Cursor user event (echoed input) */
function buildCursorUserEvent(text: string): string {
  return JSON.stringify({
    type: 'user',
    message: { content: [{ type: 'text', text }] },
  });
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

describe('CursorExecutorService', () => {
  let mockSpawn: SpawnFunction;
  let executor: CursorExecutorService;
  const originalPlatform = process.platform;

  beforeEach(() => {
    // Force Linux platform by default so tests use the direct-spawn path.
    // Windows-specific tests override to 'win32' explicitly.
    Object.defineProperty(process, 'platform', { value: 'linux', writable: true });
    mockSpawn = vi.fn();
    executor = new CursorExecutorService(mockSpawn);
  });

  afterEach(() => {
    Object.defineProperty(process, 'platform', { value: originalPlatform, writable: true });
  });

  describe('agentType', () => {
    it('should have agentType of Cursor', () => {
      expect(executor.agentType).toBe(AgentType.Cursor);
    });
  });

  describe('supportsFeature', () => {
    it('should support session-resume feature', () => {
      expect(executor.supportsFeature(AgentFeature.sessionResume)).toBe(true);
    });

    it('should support streaming feature', () => {
      expect(executor.supportsFeature(AgentFeature.streaming)).toBe(true);
    });

    it('should NOT support system-prompt feature', () => {
      expect(executor.supportsFeature(AgentFeature.systemPrompt)).toBe(false);
    });

    it('should NOT support structured-output feature', () => {
      expect(executor.supportsFeature(AgentFeature.structuredOutput)).toBe(false);
    });

    it('should NOT support tool-scoping feature', () => {
      expect(executor.supportsFeature(AgentFeature.toolScoping)).toBe(false);
    });

    it('should NOT support session-listing feature', () => {
      expect(executor.supportsFeature(AgentFeature.sessionListing)).toBe(false);
    });
  });

  describe('execute', () => {
    it('should execute prompt and return accumulated result from assistant events', async () => {
      const mockProc = createMockChildProcess();
      vi.mocked(mockSpawn).mockReturnValue(mockProc as any);

      const assistantLine = buildCursorAssistantEvent('Analysis complete. Found 3 files.');
      const resultLine = buildCursorResultEvent('sess-abc-123', 1200);

      const executePromise = executor.execute('Analyze this codebase', { silent: true });
      emitStreamData(mockProc, [assistantLine, resultLine], null, 0);

      const result = await executePromise;

      expect(result.result).toBe('Analysis complete. Found 3 files.');
      expect(result.sessionId).toBe('sess-abc-123');
      expect(mockSpawn).toHaveBeenCalledWith(
        'cursor-agent',
        expect.arrayContaining(['-p', 'Analyze this codebase', '--output-format', 'json']),
        expect.any(Object)
      );
    });

    it('should parse session_id from result event', async () => {
      const mockProc = createMockChildProcess();
      vi.mocked(mockSpawn).mockReturnValue(mockProc as any);

      const assistantLine = buildCursorAssistantEvent('Done');
      const resultLine = buildCursorResultEvent('session-xyz-789', 500);

      const executePromise = executor.execute('Do something', { silent: true });
      emitStreamData(mockProc, [assistantLine, resultLine], null, 0);

      const result = await executePromise;

      expect(result.sessionId).toBe('session-xyz-789');
    });

    it('should store duration_ms in metadata', async () => {
      const mockProc = createMockChildProcess();
      vi.mocked(mockSpawn).mockReturnValue(mockProc as any);

      const assistantLine = buildCursorAssistantEvent('Done');
      const resultLine = buildCursorResultEvent('sess-1', 1500);

      const executePromise = executor.execute('Test prompt', { silent: true });
      emitStreamData(mockProc, [assistantLine, resultLine], null, 0);

      const result = await executePromise;

      expect(result.metadata).toEqual(expect.objectContaining({ duration_ms: 1500 }));
    });

    it('should handle subprocess errors gracefully', async () => {
      const mockProc = createMockChildProcess();
      vi.mocked(mockSpawn).mockReturnValue(mockProc as any);

      const executePromise = executor.execute('Bad prompt', { silent: true });
      emitStreamData(mockProc, [], 'Error: Authentication failed', 1);

      await expect(executePromise).rejects.toThrow('Authentication failed');
    });

    it('should handle spawn error event (ENOENT)', async () => {
      const mockProc = createMockChildProcess();
      vi.mocked(mockSpawn).mockReturnValue(mockProc as any);

      const executePromise = executor.execute('Test', { silent: true });

      process.nextTick(() => {
        mockProc.emit('error', new Error('spawn agent ENOENT'));
      });

      await expect(executePromise).rejects.toThrow('spawn agent ENOENT');
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

      await expect(executePromise).rejects.toThrow(/timed out/i);
      expect(mockProc.kill).toHaveBeenCalled();
      vi.useRealTimers();
    });

    it('should handle empty result gracefully', async () => {
      const mockProc = createMockChildProcess();
      vi.mocked(mockSpawn).mockReturnValue(mockProc as any);

      const executePromise = executor.execute('Test', { silent: true });
      emitStreamData(mockProc, [], null, 0);

      const result = await executePromise;

      expect(result.result).toBe('');
      expect(result.sessionId).toBeUndefined();
    });

    it('should skip user events (echoed input)', async () => {
      const mockProc = createMockChildProcess();
      vi.mocked(mockSpawn).mockReturnValue(mockProc as any);

      const userLine = buildCursorUserEvent('My prompt text');
      const assistantLine = buildCursorAssistantEvent('Response text');
      const resultLine = buildCursorResultEvent('sess-1', 100);

      const executePromise = executor.execute('My prompt text', { silent: true });
      emitStreamData(mockProc, [userLine, assistantLine, resultLine], null, 0);

      const result = await executePromise;

      // User event should NOT appear in result text
      expect(result.result).toBe('Response text');
    });

    it('should accumulate text from multiple assistant events', async () => {
      const mockProc = createMockChildProcess();
      vi.mocked(mockSpawn).mockReturnValue(mockProc as any);

      const assistant1 = buildCursorAssistantEvent('Part 1. ');
      const assistant2 = buildCursorAssistantEvent('Part 2.');
      const resultLine = buildCursorResultEvent('sess-1', 300);

      const executePromise = executor.execute('Multi-part', { silent: true });
      emitStreamData(mockProc, [assistant1, assistant2, resultLine], null, 0);

      const result = await executePromise;

      expect(result.result).toBe('Part 1. Part 2.');
    });

    it('should log tool_call events without affecting result', async () => {
      const mockProc = createMockChildProcess();
      vi.mocked(mockSpawn).mockReturnValue(mockProc as any);

      const toolStarted = buildCursorToolCallEvent('started', 'readToolCall');
      const toolCompleted = buildCursorToolCallEvent('completed', 'readToolCall');
      const assistantLine = buildCursorAssistantEvent('File contents read.');
      const resultLine = buildCursorResultEvent('sess-1', 200);

      const executePromise = executor.execute('Read file', { silent: true });
      emitStreamData(mockProc, [toolStarted, assistantLine, toolCompleted, resultLine], null, 0);

      const result = await executePromise;

      expect(result.result).toBe('File contents read.');
      expect(result.sessionId).toBe('sess-1');
    });

    it('should pass -p flag with prompt', async () => {
      const mockProc = createMockChildProcess();
      vi.mocked(mockSpawn).mockReturnValue(mockProc as any);

      const resultLine = buildCursorResultEvent('sess-1', 100);
      const assistantLine = buildCursorAssistantEvent('Done');
      const executePromise = executor.execute('My prompt', { silent: true });
      emitStreamData(mockProc, [assistantLine, resultLine], null, 0);

      await executePromise;

      expect(mockSpawn).toHaveBeenCalledWith(
        'cursor-agent',
        expect.arrayContaining(['-p', 'My prompt']),
        expect.any(Object)
      );
    });

    it('should pass --resume flag when resumeSession is set', async () => {
      const mockProc = createMockChildProcess();
      vi.mocked(mockSpawn).mockReturnValue(mockProc as any);

      const assistantLine = buildCursorAssistantEvent('Resumed');
      const resultLine = buildCursorResultEvent('sess-resume', 100);
      const executePromise = executor.execute('Continue work', {
        resumeSession: 'prev-session-id',
        silent: true,
      });
      emitStreamData(mockProc, [assistantLine, resultLine], null, 0);

      await executePromise;

      expect(mockSpawn).toHaveBeenCalledWith(
        'cursor-agent',
        expect.arrayContaining(['--resume', 'prev-session-id']),
        expect.any(Object)
      );
    });

    it('should pass --model flag with cursor-mapped name when model option is set', async () => {
      const mockProc = createMockChildProcess();
      vi.mocked(mockSpawn).mockReturnValue(mockProc as any);

      const assistantLine = buildCursorAssistantEvent('Done');
      const resultLine = buildCursorResultEvent('sess-1', 100);
      const executePromise = executor.execute('Test', {
        model: 'claude-sonnet-4-6',
        silent: true,
      });
      emitStreamData(mockProc, [assistantLine, resultLine], null, 0);

      await executePromise;

      expect(mockSpawn).toHaveBeenCalledWith(
        'cursor-agent',
        expect.arrayContaining(['--model', 'sonnet-4.6']),
        expect.any(Object)
      );
    });

    it.each([
      ['claude-opus-5', 'opus-5'],
      ['claude-sonnet-5', 'sonnet-5'],
    ])('should map %s to the cursor model name %s', async (canonical, cursorName) => {
      const mockProc = createMockChildProcess();
      vi.mocked(mockSpawn).mockReturnValue(mockProc as any);

      const assistantLine = buildCursorAssistantEvent('Done');
      const resultLine = buildCursorResultEvent('sess-1', 100);
      const executePromise = executor.execute('Test', {
        model: canonical,
        silent: true,
      });
      emitStreamData(mockProc, [assistantLine, resultLine], null, 0);

      await executePromise;

      expect(mockSpawn).toHaveBeenCalledWith(
        'cursor-agent',
        expect.arrayContaining(['--model', cursorName]),
        expect.any(Object)
      );
    });

    it('should pass --yolo flag', async () => {
      const mockProc = createMockChildProcess();
      vi.mocked(mockSpawn).mockReturnValue(mockProc as any);

      const assistantLine = buildCursorAssistantEvent('Done');
      const resultLine = buildCursorResultEvent('sess-1', 100);
      const executePromise = executor.execute('Test', { silent: true });
      emitStreamData(mockProc, [assistantLine, resultLine], null, 0);

      await executePromise;

      expect(mockSpawn).toHaveBeenCalledWith(
        'cursor-agent',
        expect.arrayContaining(['--yolo']),
        expect.any(Object)
      );
    });

    it('should spawn PowerShell on Windows with temp file prompt', async () => {
      // On Windows, cursor CLI is invoked via PowerShell to bypass cmd.exe arg mangling
      const originalPlatform = process.platform;
      Object.defineProperty(process, 'platform', { value: 'win32' });

      try {
        const mockProc = createMockChildProcess();
        vi.mocked(mockSpawn).mockReturnValue(mockProc as any);

        const assistantLine = buildCursorAssistantEvent('Done');
        const resultLine = buildCursorResultEvent('sess-1', 100);
        const executePromise = executor.execute('Test', { silent: true });
        emitStreamData(mockProc, [assistantLine, resultLine], null, 0);

        await executePromise;

        // Should spawn powershell.exe, not agent directly
        expect(mockSpawn).toHaveBeenCalledWith(
          'powershell.exe',
          expect.arrayContaining(['-NoProfile', '-NonInteractive', '-Command']),
          expect.objectContaining({ windowsHide: true })
        );
      } finally {
        Object.defineProperty(process, 'platform', { value: originalPlatform });
      }
    });

    it('should NOT set shell on non-Windows platforms', async () => {
      const originalPlatform = process.platform;
      Object.defineProperty(process, 'platform', { value: 'linux' });

      try {
        const mockProc = createMockChildProcess();
        vi.mocked(mockSpawn).mockReturnValue(mockProc as any);

        const assistantLine = buildCursorAssistantEvent('Done');
        const resultLine = buildCursorResultEvent('sess-1', 100);
        const executePromise = executor.execute('Test', { silent: true });
        emitStreamData(mockProc, [assistantLine, resultLine], null, 0);

        await executePromise;

        const spawnOpts = vi.mocked(mockSpawn).mock.calls[0][2] as Record<string, unknown>;
        expect(spawnOpts).not.toHaveProperty('shell');
      } finally {
        Object.defineProperty(process, 'platform', { value: originalPlatform });
      }
    });

    it('should pass cwd option to spawn', async () => {
      const mockProc = createMockChildProcess();
      vi.mocked(mockSpawn).mockReturnValue(mockProc as any);

      const assistantLine = buildCursorAssistantEvent('Done');
      const resultLine = buildCursorResultEvent('sess-1', 100);
      const executePromise = executor.execute('Test', { cwd: '/some/project', silent: true });
      emitStreamData(mockProc, [assistantLine, resultLine], null, 0);

      await executePromise;

      expect(mockSpawn).toHaveBeenCalledWith(
        'cursor-agent',
        expect.any(Array),
        expect.objectContaining({ cwd: '/some/project' })
      );
    });

    it('should NOT pass --append-system-prompt even when systemPrompt is set', async () => {
      const mockProc = createMockChildProcess();
      vi.mocked(mockSpawn).mockReturnValue(mockProc as any);

      const assistantLine = buildCursorAssistantEvent('Done');
      const resultLine = buildCursorResultEvent('sess-1', 100);
      const executePromise = executor.execute('Test', {
        systemPrompt: 'You are a code reviewer',
        silent: true,
      });
      emitStreamData(mockProc, [assistantLine, resultLine], null, 0);

      await executePromise;

      const spawnArgs = vi.mocked(mockSpawn).mock.calls[0][1];
      expect(spawnArgs).not.toContain('--append-system-prompt');
    });

    it('should NOT pass --allowedTools even when allowedTools is set', async () => {
      const mockProc = createMockChildProcess();
      vi.mocked(mockSpawn).mockReturnValue(mockProc as any);

      const assistantLine = buildCursorAssistantEvent('Done');
      const resultLine = buildCursorResultEvent('sess-1', 100);
      const executePromise = executor.execute('Test', {
        allowedTools: ['Read', 'Write'],
        silent: true,
      });
      emitStreamData(mockProc, [assistantLine, resultLine], null, 0);

      await executePromise;

      const spawnArgs = vi.mocked(mockSpawn).mock.calls[0][1];
      expect(spawnArgs).not.toContain('--allowedTools');
    });

    it('should NOT pass --max-turns even when maxTurns is set', async () => {
      const mockProc = createMockChildProcess();
      vi.mocked(mockSpawn).mockReturnValue(mockProc as any);

      const assistantLine = buildCursorAssistantEvent('Done');
      const resultLine = buildCursorResultEvent('sess-1', 100);
      const executePromise = executor.execute('Test', { maxTurns: 5, silent: true });
      emitStreamData(mockProc, [assistantLine, resultLine], null, 0);

      await executePromise;

      const spawnArgs = vi.mocked(mockSpawn).mock.calls[0][1];
      expect(spawnArgs).not.toContain('--max-turns');
    });

    it('should NOT pass any auth flags', async () => {
      const mockProc = createMockChildProcess();
      vi.mocked(mockSpawn).mockReturnValue(mockProc as any);

      const assistantLine = buildCursorAssistantEvent('Done');
      const resultLine = buildCursorResultEvent('sess-1', 100);
      const executePromise = executor.execute('Test', { silent: true });
      emitStreamData(mockProc, [assistantLine, resultLine], null, 0);

      await executePromise;

      const spawnArgs = vi.mocked(mockSpawn).mock.calls[0][1];
      expect(spawnArgs).not.toContain('--api-key');
      expect(spawnArgs).not.toContain('--token');
      expect(spawnArgs).not.toContain('--auth');
    });
  });

  describe('executeStream', () => {
    it('should stream assistant events as progress', async () => {
      const mockProc = createMockChildProcess();
      vi.mocked(mockSpawn).mockReturnValue(mockProc as any);

      const events: { type: string; content: string }[] = [];

      const streamPromise = (async () => {
        for await (const event of executor.executeStream('Implement feature', { silent: true })) {
          events.push({ type: event.type, content: event.content });
          if (event.type === 'result') break;
        }
      })();

      const assistantEvent = buildCursorAssistantEvent('Working on it...');
      const resultEvent = buildCursorResultEvent('sess-stream', 800);

      await new Promise((r) => setTimeout(r, 10));
      mockProc.stdout.write(`${assistantEvent}\n`);
      await new Promise((r) => setTimeout(r, 10));
      mockProc.stdout.write(`${resultEvent}\n`);
      await new Promise((r) => setTimeout(r, 10));
      mockProc.stdout.end();
      mockProc.stderr.end();
      mockProc.emit('close', 0);

      await streamPromise;

      expect(events.length).toBeGreaterThanOrEqual(2);
      expect(events[0]).toEqual({ type: 'progress', content: 'Working on it...' });
      expect(events[1]).toEqual({ type: 'result', content: 'sess-stream' });
    });

    it('should yield error events on subprocess failure', async () => {
      const mockProc = createMockChildProcess();
      vi.mocked(mockSpawn).mockReturnValue(mockProc as any);

      const events: { type: string; content: string }[] = [];

      const streamPromise = (async () => {
        for await (const event of executor.executeStream('Bad prompt', { silent: true })) {
          events.push({ type: event.type, content: event.content });
        }
      })();

      await new Promise((r) => setTimeout(r, 10));
      mockProc.stderr.write('Fatal error occurred');
      mockProc.stdout.end();
      mockProc.stderr.end();
      mockProc.emit('close', 1);

      await streamPromise;

      const errorEvents = events.filter((e) => e.type === 'error');
      expect(errorEvents.length).toBeGreaterThanOrEqual(1);
      expect(errorEvents[0].content).toContain('Fatal error occurred');
    });

    it('should include timestamps on all events', async () => {
      const mockProc = createMockChildProcess();
      vi.mocked(mockSpawn).mockReturnValue(mockProc as any);

      const events: { type: string; timestamp: Date }[] = [];

      const streamPromise = (async () => {
        for await (const event of executor.executeStream('Test', { silent: true })) {
          events.push({ type: event.type, timestamp: event.timestamp });
        }
      })();

      const resultEvent = buildCursorResultEvent('sess-1', 100);

      await new Promise((r) => setTimeout(r, 10));
      mockProc.stdout.write(`${resultEvent}\n`);
      await new Promise((r) => setTimeout(r, 10));
      mockProc.stdout.end();
      mockProc.stderr.end();
      mockProc.emit('close', 0);

      await streamPromise;

      for (const event of events) {
        expect(event.timestamp).toBeInstanceOf(Date);
      }
    });

    it('should map tool_call started events to progress', async () => {
      const mockProc = createMockChildProcess();
      vi.mocked(mockSpawn).mockReturnValue(mockProc as any);

      const events: { type: string; content: string }[] = [];

      const streamPromise = (async () => {
        for await (const event of executor.executeStream('Test', { silent: true })) {
          events.push({ type: event.type, content: event.content });
        }
      })();

      const toolEvent = buildCursorToolCallEvent('started', 'readToolCall');

      await new Promise((r) => setTimeout(r, 10));
      mockProc.stdout.write(`${toolEvent}\n`);
      await new Promise((r) => setTimeout(r, 10));
      mockProc.stdout.end();
      mockProc.stderr.end();
      mockProc.emit('close', 0);

      await streamPromise;

      const progressEvents = events.filter((e) => e.type === 'progress');
      expect(progressEvents.length).toBeGreaterThanOrEqual(1);
      expect(progressEvents[0].content).toContain('Tool started');
    });

    it('should map tool_call completed events to progress', async () => {
      const mockProc = createMockChildProcess();
      vi.mocked(mockSpawn).mockReturnValue(mockProc as any);

      const events: { type: string; content: string }[] = [];

      const streamPromise = (async () => {
        for await (const event of executor.executeStream('Test', { silent: true })) {
          events.push({ type: event.type, content: event.content });
        }
      })();

      const toolEvent = buildCursorToolCallEvent('completed', 'shellToolCall');

      await new Promise((r) => setTimeout(r, 10));
      mockProc.stdout.write(`${toolEvent}\n`);
      await new Promise((r) => setTimeout(r, 10));
      mockProc.stdout.end();
      mockProc.stderr.end();
      mockProc.emit('close', 0);

      await streamPromise;

      const progressEvents = events.filter((e) => e.type === 'progress');
      expect(progressEvents.length).toBeGreaterThanOrEqual(1);
      expect(progressEvents[0].content).toContain('Tool completed');
      expect(progressEvents[0].content).toContain('shellToolCall');
    });

    it('should skip user events in stream', async () => {
      const mockProc = createMockChildProcess();
      vi.mocked(mockSpawn).mockReturnValue(mockProc as any);

      const events: { type: string; content: string }[] = [];

      const streamPromise = (async () => {
        for await (const event of executor.executeStream('Test', { silent: true })) {
          events.push({ type: event.type, content: event.content });
        }
      })();

      const userEvent = buildCursorUserEvent('Echoed prompt');
      const assistantEvent = buildCursorAssistantEvent('Response');

      await new Promise((r) => setTimeout(r, 10));
      mockProc.stdout.write(`${userEvent}\n`);
      mockProc.stdout.write(`${assistantEvent}\n`);
      await new Promise((r) => setTimeout(r, 10));
      mockProc.stdout.end();
      mockProc.stderr.end();
      mockProc.emit('close', 0);

      await streamPromise;

      // Should only have the assistant progress event, no user event
      expect(events.every((e) => !e.content.includes('Echoed prompt'))).toBe(true);
    });

    it('should handle malformed JSON as progress fallback', async () => {
      const mockProc = createMockChildProcess();
      vi.mocked(mockSpawn).mockReturnValue(mockProc as any);

      const events: { type: string; content: string }[] = [];

      const streamPromise = (async () => {
        for await (const event of executor.executeStream('Test', { silent: true })) {
          events.push({ type: event.type, content: event.content });
        }
      })();

      await new Promise((r) => setTimeout(r, 10));
      mockProc.stdout.write('not valid json\n');
      await new Promise((r) => setTimeout(r, 10));
      mockProc.stdout.end();
      mockProc.stderr.end();
      mockProc.emit('close', 0);

      await streamPromise;

      expect(events[0]).toEqual({ type: 'progress', content: 'not valid json' });
    });

    it('should yield error event on spawn error', async () => {
      const mockProc = createMockChildProcess();
      vi.mocked(mockSpawn).mockReturnValue(mockProc as any);

      const events: { type: string; content: string }[] = [];

      const streamPromise = (async () => {
        for await (const event of executor.executeStream('Test', { silent: true })) {
          events.push({ type: event.type, content: event.content });
        }
      })();

      await new Promise((r) => setTimeout(r, 10));
      mockProc.emit('error', new Error('spawn agent ENOENT'));

      await streamPromise;

      const errorEvents = events.filter((e) => e.type === 'error');
      expect(errorEvents.length).toBeGreaterThanOrEqual(1);
      expect(errorEvents[0].content).toContain('spawn agent ENOENT');
    });
  });

  describe('edge cases', () => {
    it('should handle partial line buffering (data arriving mid-JSON-line)', async () => {
      const mockProc = createMockChildProcess();
      vi.mocked(mockSpawn).mockReturnValue(mockProc as any);

      const assistantLine = buildCursorAssistantEvent('Complete response');
      const resultLine = buildCursorResultEvent('sess-1', 100);

      const executePromise = executor.execute('Test', { silent: true });

      process.nextTick(() => {
        // Send the assistant line in two chunks (mid-JSON split)
        const midpoint = Math.floor(assistantLine.length / 2);
        mockProc.stdout.write(assistantLine.slice(0, midpoint));
        mockProc.stdout.write(`${assistantLine.slice(midpoint)}\n`);
        mockProc.stdout.write(`${resultLine}\n`);
        mockProc.stdout.end();
        mockProc.stderr.end();
        mockProc.emit('close', 0);
      });

      const result = await executePromise;

      expect(result.result).toBe('Complete response');
    });

    it('should suppress log output in silent mode', async () => {
      const mockProc = createMockChildProcess();
      vi.mocked(mockSpawn).mockReturnValue(mockProc as any);

      const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

      const assistantLine = buildCursorAssistantEvent('Done');
      const resultLine = buildCursorResultEvent('sess-1', 100);

      const executePromise = executor.execute('Test', { silent: true });
      emitStreamData(mockProc, [assistantLine, resultLine], null, 0);

      await executePromise;

      // In silent mode, no log lines should be written
      const cursorLogCalls = writeSpy.mock.calls.filter(
        (call) => typeof call[0] === 'string' && call[0].includes('[cursor-executor]')
      );
      expect(cursorLogCalls).toHaveLength(0);

      writeSpy.mockRestore();
    });

    it('should handle tool_call with shellToolCall and readToolCall subtypes', async () => {
      const mockProc = createMockChildProcess();
      vi.mocked(mockSpawn).mockReturnValue(mockProc as any);

      const events: { type: string; content: string }[] = [];

      const streamPromise = (async () => {
        for await (const event of executor.executeStream('Test', { silent: true })) {
          events.push({ type: event.type, content: event.content });
        }
      })();

      const shellTool = buildCursorToolCallEvent('completed', 'shellToolCall');
      const readTool = buildCursorToolCallEvent('started', 'readToolCall');

      await new Promise((r) => setTimeout(r, 10));
      mockProc.stdout.write(`${shellTool}\n`);
      mockProc.stdout.write(`${readTool}\n`);
      await new Promise((r) => setTimeout(r, 10));
      mockProc.stdout.end();
      mockProc.stderr.end();
      mockProc.emit('close', 0);

      await streamPromise;

      const progressEvents = events.filter((e) => e.type === 'progress');
      expect(progressEvents.some((e) => e.content.includes('shellToolCall'))).toBe(true);
      expect(progressEvents.some((e) => e.content.includes('readToolCall'))).toBe(true);
    });
  });
});
