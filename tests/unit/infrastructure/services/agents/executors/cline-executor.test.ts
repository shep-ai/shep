/**
 * ClineExecutorService Unit Tests
 *
 * Tests for the Cline CLI subprocess executor service.
 * Uses constructor-injected spawn function mock (NOT vi.mock of child_process).
 *
 * TDD Phase: RED-GREEN
 */

import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { ClineExecutorService } from '@/infrastructure/services/agents/common/executors/cline-executor.service.js';
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

/** Build a Cline "say" event (complete, non-partial) */
function sayEvent(text: string): string {
  return JSON.stringify({ type: 'say', text, ts: Date.now(), partial: false });
}

/** Build a Cline "say" event (partial / in-progress) */
function sayPartial(text: string): string {
  return JSON.stringify({ type: 'say', text, ts: Date.now(), partial: true });
}

/** Build a Cline "ask" event */
function askEvent(text: string): string {
  return JSON.stringify({ type: 'ask', text, ts: Date.now() });
}

/** Build a Cline "error" event */
function errorEvent(text: string): string {
  return JSON.stringify({ type: 'error', text, ts: Date.now() });
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

describe('ClineExecutorService', () => {
  let mockSpawn: SpawnFunction;
  let executor: ClineExecutorService;

  beforeEach(() => {
    mockSpawn = vi.fn();
    executor = new ClineExecutorService(mockSpawn);
  });

  // --- agentType and supportsFeature ---

  describe('agentType', () => {
    it('should have agentType of Cline', () => {
      expect(executor.agentType).toBe(AgentType.Cline);
    });
  });

  describe('supportsFeature', () => {
    it('should support streaming feature', () => {
      expect(executor.supportsFeature(AgentFeature.streaming)).toBe(true);
    });

    it('should support system-prompt feature', () => {
      expect(executor.supportsFeature(AgentFeature.systemPrompt)).toBe(true);
    });

    it('should NOT support tool-scoping feature', () => {
      expect(executor.supportsFeature(AgentFeature.toolScoping)).toBe(false);
    });

    it('should NOT support structured-output feature', () => {
      expect(executor.supportsFeature(AgentFeature.structuredOutput)).toBe(false);
    });

    it('should NOT support session-resume feature', () => {
      expect(executor.supportsFeature(AgentFeature.sessionResume)).toBe(false);
    });

    it('should NOT support session-listing feature', () => {
      expect(executor.supportsFeature(AgentFeature.sessionListing)).toBe(false);
    });
  });

  // --- execute() base invocation and arg construction ---

  describe('execute', () => {
    it('should spawn cline with -y and --json flags', async () => {
      const mockProc = createMockChildProcess();
      vi.mocked(mockSpawn).mockReturnValue(mockProc as any);

      const executePromise = executor.execute('Hello cline', { silent: true });
      emitJsonlLines(mockProc, [sayEvent('Hi there')], null, 0);

      await executePromise;

      const spawnArgs = vi.mocked(mockSpawn).mock.calls[0][1] as string[];
      expect(spawnArgs).toContain('-y');
      expect(spawnArgs).toContain('--json');
    });

    it('should pass prompt as the last positional argument', async () => {
      const mockProc = createMockChildProcess();
      vi.mocked(mockSpawn).mockReturnValue(mockProc as any);

      const executePromise = executor.execute('My prompt text', { silent: true });
      emitJsonlLines(mockProc, [sayEvent('OK')], null, 0);

      await executePromise;

      const spawnArgs = vi.mocked(mockSpawn).mock.calls[0][1] as string[];
      expect(spawnArgs[spawnArgs.length - 1]).toBe('My prompt text');
    });

    it('should spawn the cline binary', async () => {
      const mockProc = createMockChildProcess();
      vi.mocked(mockSpawn).mockReturnValue(mockProc as any);

      const executePromise = executor.execute('Test', { silent: true });
      emitJsonlLines(mockProc, [sayEvent('OK')], null, 0);

      await executePromise;

      expect(vi.mocked(mockSpawn).mock.calls[0][0]).toBe('cline');
    });

    // --- JSONL parsing ---

    it('should extract result text from non-partial say events', async () => {
      const mockProc = createMockChildProcess();
      vi.mocked(mockSpawn).mockReturnValue(mockProc as any);

      const executePromise = executor.execute('Prompt', { silent: true });
      emitJsonlLines(mockProc, [sayEvent('Hello '), sayEvent('World')], null, 0);

      const result = await executePromise;
      expect(result.result).toBe('Hello World');
    });

    it('should ignore partial say events in result accumulation', async () => {
      const mockProc = createMockChildProcess();
      vi.mocked(mockSpawn).mockReturnValue(mockProc as any);

      const executePromise = executor.execute('Prompt', { silent: true });
      emitJsonlLines(
        mockProc,
        [sayPartial('Hel'), sayPartial('Hello'), sayEvent('Hello World')],
        null,
        0
      );

      const result = await executePromise;
      expect(result.result).toBe('Hello World');
    });

    it('should ignore ask events in result accumulation', async () => {
      const mockProc = createMockChildProcess();
      vi.mocked(mockSpawn).mockReturnValue(mockProc as any);

      const executePromise = executor.execute('Prompt', { silent: true });
      emitJsonlLines(
        mockProc,
        [askEvent('Do you want to proceed?'), sayEvent('Final result')],
        null,
        0
      );

      const result = await executePromise;
      expect(result.result).toBe('Final result');
    });

    it('should accumulate non-JSON lines as raw text', async () => {
      const mockProc = createMockChildProcess();
      vi.mocked(mockSpawn).mockReturnValue(mockProc as any);

      const executePromise = executor.execute('Prompt', { silent: true });
      emitJsonlLines(mockProc, ['Raw text output', sayEvent('JSON part')], null, 0);

      const result = await executePromise;
      expect(result.result).toContain('Raw text output');
      expect(result.result).toContain('JSON part');
    });

    // --- Model option ---

    it('should pass --model flag when model option is provided', async () => {
      const mockProc = createMockChildProcess();
      vi.mocked(mockSpawn).mockReturnValue(mockProc as any);

      const executePromise = executor.execute('Test', {
        model: 'claude-sonnet-4-20250514',
        silent: true,
      });
      emitJsonlLines(mockProc, [sayEvent('OK')], null, 0);

      await executePromise;

      const spawnArgs = vi.mocked(mockSpawn).mock.calls[0][1] as string[];
      expect(spawnArgs).toContain('--model');
      expect(spawnArgs).toContain('claude-sonnet-4-20250514');
    });

    it('should NOT include --model flag when model option is absent', async () => {
      const mockProc = createMockChildProcess();
      vi.mocked(mockSpawn).mockReturnValue(mockProc as any);

      const executePromise = executor.execute('Test', { silent: true });
      emitJsonlLines(mockProc, [sayEvent('OK')], null, 0);

      await executePromise;

      const spawnArgs = vi.mocked(mockSpawn).mock.calls[0][1] as string[];
      expect(spawnArgs).not.toContain('--model');
    });

    // --- cwd option ---

    it('should pass --cwd flag when cwd is provided', async () => {
      const mockProc = createMockChildProcess();
      vi.mocked(mockSpawn).mockReturnValue(mockProc as any);

      const executePromise = executor.execute('Test', {
        cwd: '/some/project',
        silent: true,
      });
      emitJsonlLines(mockProc, [sayEvent('OK')], null, 0);

      await executePromise;

      const spawnArgs = vi.mocked(mockSpawn).mock.calls[0][1] as string[];
      expect(spawnArgs).toContain('--cwd');
      expect(spawnArgs).toContain('/some/project');
    });

    it('should set cwd in spawn options when cwd is provided', async () => {
      const mockProc = createMockChildProcess();
      vi.mocked(mockSpawn).mockReturnValue(mockProc as any);

      const executePromise = executor.execute('Test', {
        cwd: '/some/project',
        silent: true,
      });
      emitJsonlLines(mockProc, [sayEvent('OK')], null, 0);

      await executePromise;

      const spawnOpts = vi.mocked(mockSpawn).mock.calls[0][2] as Record<string, unknown>;
      expect(spawnOpts.cwd).toBe('/some/project');
    });

    // --- Timeout option ---

    it('should pass --timeout flag in seconds when timeout option is provided', async () => {
      const mockProc = createMockChildProcess();
      vi.mocked(mockSpawn).mockReturnValue(mockProc as any);

      const executePromise = executor.execute('Test', { timeout: 30000, silent: true });
      emitJsonlLines(mockProc, [sayEvent('OK')], null, 0);

      await executePromise;

      const spawnArgs = vi.mocked(mockSpawn).mock.calls[0][1] as string[];
      expect(spawnArgs).toContain('--timeout');
      expect(spawnArgs).toContain('30');
    });

    it('should strip CLAUDECODE from spawn environment', async () => {
      const originalEnv = process.env.CLAUDECODE;
      process.env.CLAUDECODE = 'some-value';

      const mockProc = createMockChildProcess();
      vi.mocked(mockSpawn).mockReturnValue(mockProc as any);

      const executePromise = executor.execute('Test', { silent: true });
      emitJsonlLines(mockProc, [sayEvent('OK')], null, 0);

      await executePromise;

      const spawnOpts = vi.mocked(mockSpawn).mock.calls[0][2] as Record<string, unknown>;
      const env = spawnOpts.env as Record<string, string>;
      expect(env.CLAUDECODE).toBeUndefined();

      if (originalEnv !== undefined) process.env.CLAUDECODE = originalEnv;
      else delete process.env.CLAUDECODE;
    });

    // --- Error handling ---

    it('should reject with install instructions on ENOENT error', async () => {
      const mockProc = createMockChildProcess();
      vi.mocked(mockSpawn).mockReturnValue(mockProc as any);

      const executePromise = executor.execute('Test', { silent: true });

      process.nextTick(() => {
        const error = new Error('spawn cline ENOENT') as Error & { code: string };
        error.code = 'ENOENT';
        mockProc.emit('error', error);
      });

      await expect(executePromise).rejects.toThrow(/Cline CLI.*not found/i);
    });

    it('should include npm install instructions in ENOENT error', async () => {
      const mockProc = createMockChildProcess();
      vi.mocked(mockSpawn).mockReturnValue(mockProc as any);

      const executePromise = executor.execute('Test', { silent: true });

      process.nextTick(() => {
        const error = new Error('spawn cline ENOENT') as Error & { code: string };
        error.code = 'ENOENT';
        mockProc.emit('error', error);
      });

      await expect(executePromise).rejects.toThrow(/npm install -g cline/i);
    });

    it('should reject with stderr content on non-zero exit code', async () => {
      const mockProc = createMockChildProcess();
      vi.mocked(mockSpawn).mockReturnValue(mockProc as any);

      const executePromise = executor.execute('Bad prompt', { silent: true });
      emitJsonlLines(mockProc, [], 'Something went wrong', 1);

      await expect(executePromise).rejects.toThrow('Something went wrong');
    });

    it('should reject with exit code in message when stderr is empty', async () => {
      const mockProc = createMockChildProcess();
      vi.mocked(mockSpawn).mockReturnValue(mockProc as any);

      const executePromise = executor.execute('Bad prompt', { silent: true });
      emitJsonlLines(mockProc, [], null, 1);

      await expect(executePromise).rejects.toThrow('Process exited with code 1');
    });

    it('should skip malformed JSON lines gracefully', async () => {
      const mockProc = createMockChildProcess();
      vi.mocked(mockSpawn).mockReturnValue(mockProc as any);

      const executePromise = executor.execute('Prompt', { silent: true });
      emitJsonlLines(mockProc, ['this is not valid json {{{', sayEvent('Real result')], null, 0);

      const result = await executePromise;
      expect(result.result).toContain('Real result');
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

    it('should handle exit code 0 with empty response gracefully', async () => {
      const mockProc = createMockChildProcess();
      vi.mocked(mockSpawn).mockReturnValue(mockProc as any);

      const executePromise = executor.execute('Prompt', { silent: true });
      emitJsonlLines(mockProc, [], null, 0);

      const result = await executePromise;
      expect(result.result).toBe('');
    });

    it('should handle line buffering across chunk boundaries', async () => {
      const mockProc = createMockChildProcess();
      vi.mocked(mockSpawn).mockReturnValue(mockProc as any);

      const executePromise = executor.execute('Prompt', { silent: true });

      process.nextTick(() => {
        // Simulate chunks that split across JSONL lines
        const full = sayEvent('Split response');
        const half1 = full.slice(0, 10);
        const half2 = `${full.slice(10)}\n`;

        mockProc.stdout.write(half1);
        mockProc.stdout.write(half2);
        mockProc.stdout.end();
        mockProc.stderr.end();
        mockProc.emit('close', 0);
      });

      const result = await executePromise;
      expect(result.result).toBe('Split response');
    });

    // --- Windows platform ---

    it('should set windowsHide option on Windows', async () => {
      const originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform');
      Object.defineProperty(process, 'platform', { value: 'win32' });

      const mockProc = createMockChildProcess();
      vi.mocked(mockSpawn).mockReturnValue(mockProc as any);

      const executePromise = executor.execute('Test', { silent: true });
      emitJsonlLines(mockProc, [sayEvent('OK')], null, 0);

      await executePromise;

      const spawnOpts = vi.mocked(mockSpawn).mock.calls[0][2] as Record<string, unknown>;
      expect(spawnOpts.windowsHide).toBe(true);

      if (originalPlatform) {
        Object.defineProperty(process, 'platform', originalPlatform);
      }
    });
  });

  // --- executeStream() ---

  describe('executeStream', () => {
    it('should yield progress events from partial say events', async () => {
      const mockProc = createMockChildProcess();
      vi.mocked(mockSpawn).mockReturnValue(mockProc as any);

      const events: { type: string; content: string }[] = [];
      const gen = executor.executeStream('Hello', { silent: true });

      process.nextTick(() => {
        mockProc.stdout.write(`${sayPartial('He')}\n`);
        mockProc.stdout.write(`${sayPartial('Hello')}\n`);
        mockProc.stdout.write(`${sayEvent('Hello World')}\n`);
        mockProc.stdout.end();
        mockProc.stderr.end();
        mockProc.emit('close', 0);
      });

      for await (const event of gen) {
        events.push({ type: event.type, content: event.content });
      }

      const progressEvents = events.filter((e) => e.type === 'progress');
      expect(progressEvents).toContainEqual({ type: 'progress', content: 'He' });
      expect(progressEvents).toContainEqual({ type: 'progress', content: 'Hello' });
    });

    it('should yield result events from non-partial say events', async () => {
      const mockProc = createMockChildProcess();
      vi.mocked(mockSpawn).mockReturnValue(mockProc as any);

      const events: { type: string; content: string }[] = [];
      const gen = executor.executeStream('Prompt', { silent: true });

      process.nextTick(() => {
        mockProc.stdout.write(`${sayEvent('Final response')}\n`);
        mockProc.stdout.end();
        mockProc.stderr.end();
        mockProc.emit('close', 0);
      });

      for await (const event of gen) {
        events.push({ type: event.type, content: event.content });
      }

      const resultEvents = events.filter((e) => e.type === 'result');
      expect(resultEvents).toHaveLength(1);
      expect(resultEvents[0].content).toBe('Final response');
    });

    it('should yield progress events from ask events', async () => {
      const mockProc = createMockChildProcess();
      vi.mocked(mockSpawn).mockReturnValue(mockProc as any);

      const events: { type: string; content: string }[] = [];
      const gen = executor.executeStream('Prompt', { silent: true });

      process.nextTick(() => {
        mockProc.stdout.write(`${askEvent('Proceed?')}\n`);
        mockProc.stdout.write(`${sayEvent('Done')}\n`);
        mockProc.stdout.end();
        mockProc.stderr.end();
        mockProc.emit('close', 0);
      });

      for await (const event of gen) {
        events.push({ type: event.type, content: event.content });
      }

      expect(events).toContainEqual({ type: 'progress', content: 'Proceed?' });
    });

    it('should yield error events from error JSON events', async () => {
      const mockProc = createMockChildProcess();
      vi.mocked(mockSpawn).mockReturnValue(mockProc as any);

      const events: { type: string; content: string }[] = [];
      const gen = executor.executeStream('Prompt', { silent: true });

      process.nextTick(() => {
        mockProc.stdout.write(`${errorEvent('Something failed')}\n`);
        mockProc.stdout.end();
        mockProc.stderr.end();
        mockProc.emit('close', 0);
      });

      for await (const event of gen) {
        events.push({ type: event.type, content: event.content });
      }

      expect(events).toContainEqual({ type: 'error', content: 'Something failed' });
    });

    it('should yield an error event on non-zero exit code with stderr', async () => {
      const mockProc = createMockChildProcess();
      vi.mocked(mockSpawn).mockReturnValue(mockProc as any);

      const events: { type: string; content: string }[] = [];
      const gen = executor.executeStream('Prompt', { silent: true });

      process.nextTick(() => {
        mockProc.stdout.end();
        mockProc.stderr.write('Internal server error');
        mockProc.stderr.end();
        mockProc.emit('close', 1);
      });

      for await (const event of gen) {
        events.push({ type: event.type, content: event.content });
      }

      expect(events.some((e) => e.type === 'error')).toBe(true);
      expect(events.find((e) => e.type === 'error')?.content).toBe('Internal server error');
    });

    it('should yield error event on process error', async () => {
      const mockProc = createMockChildProcess();
      vi.mocked(mockSpawn).mockReturnValue(mockProc as any);

      const events: { type: string; content: string }[] = [];
      const gen = executor.executeStream('Prompt', { silent: true });

      process.nextTick(() => {
        mockProc.emit('error', new Error('Process crashed'));
      });

      for await (const event of gen) {
        events.push({ type: event.type, content: event.content });
      }

      expect(events.some((e) => e.type === 'error')).toBe(true);
      expect(events.find((e) => e.type === 'error')?.content).toBe('Process crashed');
    });

    it('should handle non-JSON lines as progress events in streaming', async () => {
      const mockProc = createMockChildProcess();
      vi.mocked(mockSpawn).mockReturnValue(mockProc as any);

      const events: { type: string; content: string }[] = [];
      const gen = executor.executeStream('Prompt', { silent: true });

      process.nextTick(() => {
        mockProc.stdout.write('Raw text line\n');
        mockProc.stdout.write(`${sayEvent('JSON result')}\n`);
        mockProc.stdout.end();
        mockProc.stderr.end();
        mockProc.emit('close', 0);
      });

      for await (const event of gen) {
        events.push({ type: event.type, content: event.content });
      }

      expect(events).toContainEqual({ type: 'progress', content: 'Raw text line' });
      expect(events).toContainEqual({ type: 'result', content: 'JSON result' });
    });

    it('should flush line buffer on process close', async () => {
      const mockProc = createMockChildProcess();
      vi.mocked(mockSpawn).mockReturnValue(mockProc as any);

      const events: { type: string; content: string }[] = [];
      const gen = executor.executeStream('Prompt', { silent: true });

      process.nextTick(() => {
        // Write without trailing newline — should be flushed on close
        mockProc.stdout.write(sayEvent('Buffered'));
        mockProc.stdout.end();
        mockProc.stderr.end();
        mockProc.emit('close', 0);
      });

      for await (const event of gen) {
        events.push({ type: event.type, content: event.content });
      }

      expect(events).toContainEqual({ type: 'result', content: 'Buffered' });
    });
  });
});
