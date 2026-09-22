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
import { AgentType, AgentFeature, SecurityMode } from '@/domain/generated/output.js';
import { SecurityViolationError } from '@/domain/errors/security-violation.error.js';
import { strictConstraints } from './security-constraints.fixture.js';

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
    vi.useRealTimers();
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

      await expect(executePromise).rejects.toThrow('Agent execution timed out after 5s');
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
      // The result event carries the ANSWER. It used to carry the session id,
      // so every graph node downstream received a UUID instead of the work.
      expect(events[1]).toEqual({ type: 'result', content: 'Working on it...' });
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
  // --- defects proven by audit: result mapping, quoting, UTF-8, lifetime ---

  describe('stream result mapping', () => {
    it('should emit an error for a non-zero exit even when stderr is empty', async () => {
      const mockProc = createMockChildProcess();
      vi.mocked(mockSpawn).mockReturnValue(mockProc as any);

      const events: { type: string; content: string }[] = [];
      const gen = executor.executeStream('Q', { silent: true });
      emitStreamData(mockProc, [], null, 2);

      for await (const event of gen) {
        events.push({ type: event.type, content: event.content });
      }

      expect(events).toEqual([{ type: 'error', content: 'Process exited with code 2' }]);
    });

    it('should reject execute() when the result event reports is_error', async () => {
      const mockProc = createMockChildProcess();
      vi.mocked(mockSpawn).mockReturnValue(mockProc as any);

      const executePromise = executor.execute('Q', { silent: true });
      emitStreamData(
        mockProc,
        [
          buildCursorResultEvent('sess-1', 10, {
            subtype: 'error_max_turns',
            is_error: true,
            result: 'Partial work',
          }),
        ],
        null,
        0
      );

      await expect(executePromise).rejects.toThrow(/error_max_turns/);
    });

    it('should reject execute() for is_error without a subtype', async () => {
      const mockProc = createMockChildProcess();
      vi.mocked(mockSpawn).mockReturnValue(mockProc as any);

      const executePromise = executor.execute('Q', { silent: true });
      emitStreamData(
        mockProc,
        [buildCursorResultEvent('sess-1', 10, { is_error: true, result: 'provider failed' })],
        null,
        0
      );

      await expect(executePromise).rejects.toThrow(/provider failed/);
    });

    it('should emit an error, not a result, when the stream result reports is_error', async () => {
      const mockProc = createMockChildProcess();
      vi.mocked(mockSpawn).mockReturnValue(mockProc as any);

      const events: { type: string; content: string }[] = [];
      const gen = executor.executeStream('Q', { silent: true });
      emitStreamData(
        mockProc,
        [
          buildCursorAssistantEvent('Partial'),
          buildCursorResultEvent('sess-1', 10, { subtype: 'error_max_turns', is_error: true }),
        ],
        null,
        0
      );

      for await (const event of gen) {
        events.push({ type: event.type, content: event.content });
      }

      expect(events.some((e) => e.type === 'result')).toBe(false);
      expect(events.some((e) => e.type === 'error' && /error_max_turns/.test(e.content))).toBe(
        true
      );
    });

    it('should report the session id out of band rather than as the answer', async () => {
      const mockProc = createMockChildProcess();
      vi.mocked(mockSpawn).mockReturnValue(mockProc as any);

      const events: { type: string; content: string; sessionId?: string }[] = [];
      const gen = executor.executeStream('Q', { silent: true });

      process.nextTick(() => {
        mockProc.stdout.write(`${buildCursorAssistantEvent('The answer is 42.')}\n`);
        mockProc.stdout.write(`${buildCursorResultEvent('9f1c2f4e-dead-beef', 10)}\n`);
        mockProc.stdout.end();
        mockProc.stderr.end();
        mockProc.emit('close', 0);
      });

      for await (const event of gen) {
        events.push({ type: event.type, content: event.content, sessionId: event.sessionId });
      }

      const resultEvent = events.find((e) => e.type === 'result');
      expect(resultEvent?.content).toBe('The answer is 42.');
      expect(resultEvent?.sessionId).toBe('9f1c2f4e-dead-beef');
    });

    it('should stringify a structured error payload instead of [object Object]', async () => {
      const mockProc = createMockChildProcess();
      vi.mocked(mockSpawn).mockReturnValue(mockProc as any);

      const events: { type: string; content: string }[] = [];
      const gen = executor.executeStream('Q', { silent: true });

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

  describe('Windows PowerShell quoting', () => {
    it('should quote every agent flag instead of splicing settings into the command', async () => {
      const originalPlatform = process.platform;
      Object.defineProperty(process, 'platform', { value: 'win32', writable: true });

      try {
        const mockProc = createMockChildProcess();
        vi.mocked(mockSpawn).mockReturnValue(mockProc as any);

        // `model` is a free-form settings string; it must not be able to end
        // the cursor-agent invocation and start a command of its own.
        const hostileModel = "sonnet'; Remove-Item C:\\ -Recurse #";
        const executePromise = executor.execute('Test', { model: hostileModel, silent: true });
        emitStreamData(
          mockProc,
          [buildCursorAssistantEvent('Done'), buildCursorResultEvent('sess-1', 100)],
          null,
          0
        );
        await executePromise;

        const psCmd = (vi.mocked(mockSpawn).mock.calls[0][1] as string[]).at(-1)!;
        // Single quotes make a PowerShell literal; an embedded quote is doubled.
        expect(psCmd).toContain("'sonnet''; Remove-Item C:\\ -Recurse #'");
        expect(psCmd).toContain("'--yolo'");
        expect(psCmd).not.toContain(`& cursor-agent ${hostileModel}`);
      } finally {
        Object.defineProperty(process, 'platform', { value: originalPlatform, writable: true });
      }
    });

    it('should still pass a plain argv array on POSIX', async () => {
      const mockProc = createMockChildProcess();
      vi.mocked(mockSpawn).mockReturnValue(mockProc as any);

      const executePromise = executor.execute('Test', { model: 'claude-opus-5', silent: true });
      emitStreamData(
        mockProc,
        [buildCursorAssistantEvent('Done'), buildCursorResultEvent('sess-1', 100)],
        null,
        0
      );
      await executePromise;

      const args = vi.mocked(mockSpawn).mock.calls[0][1] as string[];
      expect(args).toContain('opus-5');
      expect(args.some((a) => a.includes("'"))).toBe(false);
    });
  });

  describe('multi-byte output', () => {
    it('should not corrupt a character split across two stdout chunks', async () => {
      const mockProc = createMockChildProcess();
      vi.mocked(mockSpawn).mockReturnValue(mockProc as any);

      const answer = 'héllo — ✅ 日本語 🚀 done';
      const payload = Buffer.from(`${buildCursorAssistantEvent(answer)}\n`, 'utf8');
      const splitAt = payload.indexOf(Buffer.from('🚀', 'utf8')) + 2;

      const executePromise = executor.execute('Q', { silent: true });
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

  describe('signal termination', () => {
    it('should reject naming the signal when killed after partial text', async () => {
      const mockProc = createMockChildProcess();
      vi.mocked(mockSpawn).mockReturnValue(mockProc as any);

      const executePromise = executor.execute('Q', { silent: true });
      process.nextTick(() => {
        for (const line of [buildCursorAssistantEvent('partial work')])
          mockProc.stdout.write(`${line}\n`);
        mockProc.stdout.end();
        mockProc.stderr.end();
        mockProc.emit('close', null, 'SIGKILL');
      });

      await expect(executePromise).rejects.toThrow(/SIGKILL/);
    });

    it('should keep the answer when the signal arrives after the result event', async () => {
      const mockProc = createMockChildProcess();
      vi.mocked(mockSpawn).mockReturnValue(mockProc as any);

      const executePromise = executor.execute('Q', { silent: true });
      process.nextTick(() => {
        for (const line of [buildCursorResultEvent('sess-1', 10, { result: 'all done' })])
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
        for (const line of [buildCursorAssistantEvent('partial work')])
          mockProc.stdout.write(`${line}\n`);
        mockProc.stdout.end();
        mockProc.stderr.end();
        mockProc.emit('close', null, 'SIGKILL');
      });
      const events: { type: string; content: string }[] = [];
      for await (const event of executor.executeStream('Prompt', { silent: true })) {
        events.push({ type: event.type, content: event.content });
      }

      expect(events.some((e) => e.type === 'error' && e.content.includes('SIGKILL'))).toBe(true);
      expect(events.some((e) => e.type === 'result')).toBe(false);
    });

    it('should reject when the CLI is killed by a signal with nothing captured', async () => {
      const mockProc = createMockChildProcess();
      vi.mocked(mockSpawn).mockReturnValue(mockProc as any);

      const executePromise = executor.execute('Q', { silent: true });
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
        executor.execute('Q', {
          silent: true,
          securityConstraints: strictConstraints(SecurityMode.Enforce),
        })
      ).rejects.toBeInstanceOf(SecurityViolationError);

      expect(mockSpawn).not.toHaveBeenCalled();
    });

    it('should refuse executeStream() under an enforced strict sandbox', async () => {
      const iterate = async () => {
        for await (const _event of executor.executeStream('Q', {
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
    it('should kill the child when the consumer stops iterating early', async () => {
      const mockProc = createMockChildProcess();
      vi.mocked(mockSpawn).mockReturnValue(mockProc as any);

      const gen = executor.executeStream('Q', { silent: true });
      process.nextTick(() => {
        mockProc.stdout.write(`${buildCursorAssistantEvent('partial')}\n`);
      });

      for await (const _event of gen) {
        break;
      }

      expect(mockProc.kill).toHaveBeenCalled();
    });

    it('should time out a stream that never closes', async () => {
      const mockProc = createMockChildProcess();
      vi.mocked(mockSpawn).mockReturnValue(mockProc as any);

      const events: { type: string; content: string }[] = [];
      for await (const event of executor.executeStream('Q', { silent: true, timeout: 20 })) {
        events.push({ type: event.type, content: event.content });
      }

      expect(events).toContainEqual({
        type: 'error',
        content: 'Agent execution timed out after 0.02s',
      });
      expect(mockProc.kill).toHaveBeenCalled();
    });
  });
});

describe('CursorExecutorService — idle timeout', () => {
  // A stalled agent (hung API connection, wedged tool) used to sit out the
  // whole total budget — 30 minutes by default, hours for a long implement
  // stage. `idleTimeout` ends it after that long without any output.
  let mockSpawn: SpawnFunction;
  let executor: CursorExecutorService;

  beforeEach(() => {
    mockSpawn = vi.fn();
    executor = new CursorExecutorService(mockSpawn);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('execute(): arms no idle guard — its single-result json mode is silent until the end', async () => {
    // execute() runs the CLI with `--output-format json`, which prints ONE
    // line when the whole turn is done. Silence there is the normal shape of
    // a healthy run, so an idle guard would kill every run longer than the
    // budget; only the total timeout bounds it.
    vi.useFakeTimers();
    const proc = createMockChildProcess();
    vi.mocked(mockSpawn).mockReturnValue(proc as any);

    let settled = false;
    const pending = executor
      .execute('Prompt', { silent: true, idleTimeout: 60_000 })
      .finally(() => (settled = true));
    await vi.advanceTimersByTimeAsync(10 * 60_000);

    expect(settled).toBe(false);
    expect(proc.kill).not.toHaveBeenCalled();
    proc.stdout.end();
    proc.stderr.end();
    proc.emit('close', 1, null);
    await pending.catch(() => undefined);
  });

  it('executeStream(): ends a silent stream with an idle-timeout error event', async () => {
    const proc = createMockChildProcess();
    vi.mocked(mockSpawn).mockReturnValue(proc as any);

    const events: { type: string; content: string }[] = [];
    for await (const event of executor.executeStream('Prompt', {
      silent: true,
      idleTimeout: 20,
    })) {
      events.push({ type: event.type, content: event.content });
    }

    expect(events).toContainEqual({
      type: 'error',
      content: 'Agent execution timed out: no output for 0.02s',
    });
    expect(proc.kill).toHaveBeenCalled();
  });
});
