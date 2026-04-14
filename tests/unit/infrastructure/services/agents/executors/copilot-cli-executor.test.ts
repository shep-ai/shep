/**
 * CopilotCliExecutorService Unit Tests
 *
 * Tests for the GitHub Copilot CLI subprocess executor service.
 * Uses constructor-injected spawn function mock (NOT vi.mock of child_process).
 *
 * TDD Phase: RED-GREEN
 */

import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { existsSync } from 'node:fs';
import { CopilotCliExecutorService } from '@/infrastructure/services/agents/common/executors/copilot-cli-executor.service.js';
import type { SpawnFunction } from '@/infrastructure/services/agents/common/types.js';
import { AgentType, AgentFeature } from '@/domain/generated/output.js';
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

/** Build a Copilot assistant.message_delta event */
function messageDelta(delta: string): string {
  return JSON.stringify({ type: 'assistant.message_delta', delta });
}

/** Build a Copilot assistant.message event (complete message) */
function assistantMessage(content: string): string {
  return JSON.stringify({ type: 'assistant.message', content });
}

/** Build a Copilot result event */
function resultEvent(
  sessionId: string,
  usage?: { inputTokens: number; outputTokens: number }
): string {
  return JSON.stringify({
    type: 'result',
    sessionId,
    ...(usage ? { usage } : {}),
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

describe('CopilotCliExecutorService', () => {
  let mockSpawn: SpawnFunction;
  let executor: CopilotCliExecutorService;

  beforeEach(() => {
    mockSpawn = vi.fn();
    executor = new CopilotCliExecutorService(mockSpawn);
  });

  // --- agentType and supportsFeature ---

  describe('agentType', () => {
    it('should have agentType of CopilotCli', () => {
      expect(executor.agentType).toBe(AgentType.CopilotCli);
    });
  });

  describe('supportsFeature', () => {
    it('should support session-resume feature', () => {
      expect(executor.supportsFeature(AgentFeature.sessionResume)).toBe(true);
    });

    it('should support streaming feature', () => {
      expect(executor.supportsFeature(AgentFeature.streaming)).toBe(true);
    });

    it('should NOT support tool-scoping feature', () => {
      expect(executor.supportsFeature(AgentFeature.toolScoping)).toBe(false);
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

  // --- execute() base invocation and arg construction ---

  describe('execute', () => {
    it('should spawn copilot with the prompt via -p flag', async () => {
      const mockProc = createMockChildProcess();
      vi.mocked(mockSpawn).mockReturnValue(mockProc as any);

      const executePromise = executor.execute('Hello copilot', { silent: true });
      emitJsonlLines(mockProc, [assistantMessage('Hi there'), resultEvent('session-1')], null, 0);

      await executePromise;

      const spawnArgs = vi.mocked(mockSpawn).mock.calls[0][1] as string[];
      expect(spawnArgs[0]).toBe('-p');
      expect(spawnArgs[1]).toBe('Hello copilot');
    });

    it('should include all base flags in every invocation', async () => {
      const mockProc = createMockChildProcess();
      vi.mocked(mockSpawn).mockReturnValue(mockProc as any);

      const executePromise = executor.execute('Test', { silent: true });
      emitJsonlLines(mockProc, [assistantMessage('OK'), resultEvent('session-1')], null, 0);

      await executePromise;

      const spawnArgs = vi.mocked(mockSpawn).mock.calls[0][1] as string[];
      expect(spawnArgs).toContain('--allow-all');
      expect(spawnArgs).toContain('--output-format');
      expect(spawnArgs).toContain('json');
      expect(spawnArgs).toContain('-s');
      expect(spawnArgs).toContain('--no-custom-instructions');
      expect(spawnArgs).toContain('--no-ask-user');
    });

    it('should NOT pipe prompt via stdin', async () => {
      const mockProc = createMockChildProcess();
      vi.mocked(mockSpawn).mockReturnValue(mockProc as any);

      const stdinWriteSpy = vi.spyOn(mockProc.stdin, 'write');

      const executePromise = executor.execute('My prompt', { silent: true });
      emitJsonlLines(mockProc, [assistantMessage('Result'), resultEvent('s-1')], null, 0);

      await executePromise;

      expect(stdinWriteSpy).not.toHaveBeenCalled();
    });

    it('should use file indirection for very large prompts to avoid arg-length failures', async () => {
      const mockProc = createMockChildProcess();
      vi.mocked(mockSpawn).mockReturnValue(mockProc as any);
      const largePrompt = 'x'.repeat(50_000);

      const executePromise = executor.execute(largePrompt, { silent: true });
      await vi.waitFor(() => {
        expect(vi.mocked(mockSpawn)).toHaveBeenCalledTimes(1);
      });
      emitJsonlLines(mockProc, [assistantMessage('OK'), resultEvent('s-1')], null, 0);

      await executePromise;

      const spawnArgs = vi.mocked(mockSpawn).mock.calls[0][1] as string[];
      expect(spawnArgs[0]).toBe('-p');
      expect(spawnArgs[1]).not.toBe(largePrompt);
      expect(spawnArgs[1]).toContain('The full original user prompt is stored in this file:');
    });

    it('should clean up temporary prompt file after large prompt execution', async () => {
      const mockProc = createMockChildProcess();
      vi.mocked(mockSpawn).mockReturnValue(mockProc as any);
      const largePrompt = 'x'.repeat(50_000);

      const executePromise = executor.execute(largePrompt, { silent: true });
      await vi.waitFor(() => {
        expect(vi.mocked(mockSpawn)).toHaveBeenCalledTimes(1);
      });
      emitJsonlLines(mockProc, [assistantMessage('OK'), resultEvent('s-1')], null, 0);

      await executePromise;

      const spawnArgs = vi.mocked(mockSpawn).mock.calls[0][1] as string[];
      const wrapperPrompt = spawnArgs[1] ?? '';
      const match = wrapperPrompt.match(/stored in this file:\n(.+)\nRead that file completely/);

      expect(match?.[1]).toBeDefined();
      expect(existsSync(match![1])).toBe(false);
    });

    it('should spawn the copilot binary', async () => {
      const mockProc = createMockChildProcess();
      vi.mocked(mockSpawn).mockReturnValue(mockProc as any);

      const executePromise = executor.execute('Test', { silent: true });
      emitJsonlLines(mockProc, [assistantMessage('OK'), resultEvent('s-1')], null, 0);

      await executePromise;

      expect(vi.mocked(mockSpawn).mock.calls[0][0]).toBe('copilot');
    });

    // --- JSONL parsing ---

    it('should extract response text from assistant.message events', async () => {
      const mockProc = createMockChildProcess();
      vi.mocked(mockSpawn).mockReturnValue(mockProc as any);

      const executePromise = executor.execute('Prompt', { silent: true });
      emitJsonlLines(
        mockProc,
        [assistantMessage('Hello '), assistantMessage('World'), resultEvent('s-1')],
        null,
        0
      );

      const result = await executePromise;
      expect(result.result).toBe('Hello World');
    });

    it('should extract sessionId from the result event', async () => {
      const mockProc = createMockChildProcess();
      vi.mocked(mockSpawn).mockReturnValue(mockProc as any);

      const executePromise = executor.execute('Prompt', { silent: true });
      emitJsonlLines(
        mockProc,
        [assistantMessage('OK'), resultEvent('my-session-abc-123')],
        null,
        0
      );

      const result = await executePromise;
      expect(result.sessionId).toBe('my-session-abc-123');
    });

    it('should return undefined sessionId when result event is missing sessionId', async () => {
      const mockProc = createMockChildProcess();
      vi.mocked(mockSpawn).mockReturnValue(mockProc as any);

      const executePromise = executor.execute('Prompt', { silent: true });
      emitJsonlLines(mockProc, [assistantMessage('OK')], null, 0);

      const result = await executePromise;
      expect(result.sessionId).toBeUndefined();
    });

    it('should extract usage from the result event', async () => {
      const mockProc = createMockChildProcess();
      vi.mocked(mockSpawn).mockReturnValue(mockProc as any);

      const executePromise = executor.execute('Prompt', { silent: true });
      emitJsonlLines(
        mockProc,
        [assistantMessage('OK'), resultEvent('s-1', { inputTokens: 100, outputTokens: 50 })],
        null,
        0
      );

      const result = await executePromise;
      expect(result.usage).toEqual({ inputTokens: 100, outputTokens: 50 });
    });

    it('should return undefined usage when result event has no usage', async () => {
      const mockProc = createMockChildProcess();
      vi.mocked(mockSpawn).mockReturnValue(mockProc as any);

      const executePromise = executor.execute('Prompt', { silent: true });
      emitJsonlLines(mockProc, [assistantMessage('OK'), resultEvent('s-1')], null, 0);

      const result = await executePromise;
      expect(result.usage).toBeUndefined();
    });

    it('should ignore assistant.message_delta events (progress only, not result)', async () => {
      const mockProc = createMockChildProcess();
      vi.mocked(mockSpawn).mockReturnValue(mockProc as any);

      const executePromise = executor.execute('Prompt', { silent: true });
      emitJsonlLines(
        mockProc,
        [messageDelta('Hel'), messageDelta('lo'), assistantMessage('Hello'), resultEvent('s-1')],
        null,
        0
      );

      const result = await executePromise;
      // Result text should come from assistant.message, not deltas
      expect(result.result).toBe('Hello');
    });

    // --- Model option ---

    it('should pass --model flag when model option is provided', async () => {
      const mockProc = createMockChildProcess();
      vi.mocked(mockSpawn).mockReturnValue(mockProc as any);

      const executePromise = executor.execute('Test', { model: 'claude-opus-4.5', silent: true });
      emitJsonlLines(mockProc, [assistantMessage('OK'), resultEvent('s-1')], null, 0);

      await executePromise;

      const spawnArgs = vi.mocked(mockSpawn).mock.calls[0][1] as string[];
      expect(spawnArgs).toContain('--model');
      expect(spawnArgs).toContain('claude-opus-4.5');
    });

    it('should normalize legacy hyphenated Copilot model aliases', async () => {
      const mockProc = createMockChildProcess();
      vi.mocked(mockSpawn).mockReturnValue(mockProc as any);

      const executePromise = executor.execute('Test', { model: 'claude-sonnet-4-5', silent: true });
      emitJsonlLines(mockProc, [assistantMessage('OK'), resultEvent('s-1')], null, 0);

      await executePromise;

      const spawnArgs = vi.mocked(mockSpawn).mock.calls[0][1] as string[];
      expect(spawnArgs).toContain('--model');
      expect(spawnArgs).toContain('claude-sonnet-4.5');
      expect(spawnArgs).not.toContain('claude-sonnet-4-5');
    });

    it('should normalize legacy hyphenated GPT model aliases', async () => {
      const mockProc = createMockChildProcess();
      vi.mocked(mockSpawn).mockReturnValue(mockProc as any);

      const executePromise = executor.execute('Test', { model: 'gpt-5-4-mini', silent: true });
      emitJsonlLines(mockProc, [assistantMessage('OK'), resultEvent('s-1')], null, 0);

      await executePromise;

      const spawnArgs = vi.mocked(mockSpawn).mock.calls[0][1] as string[];
      expect(spawnArgs).toContain('--model');
      expect(spawnArgs).toContain('gpt-5.4-mini');
      expect(spawnArgs).not.toContain('gpt-5-4-mini');
    });

    it('should normalize generic legacy GPT model aliases', async () => {
      const mockProc = createMockChildProcess();
      vi.mocked(mockSpawn).mockReturnValue(mockProc as any);

      const executePromise = executor.execute('Test', { model: 'gpt-6-1-custom', silent: true });
      emitJsonlLines(mockProc, [assistantMessage('OK'), resultEvent('s-1')], null, 0);

      await executePromise;

      const spawnArgs = vi.mocked(mockSpawn).mock.calls[0][1] as string[];
      expect(spawnArgs).toContain('--model');
      expect(spawnArgs).toContain('gpt-6.1-custom');
      expect(spawnArgs).not.toContain('gpt-6-1-custom');
    });

    it('should NOT include --model flag when model option is absent', async () => {
      const mockProc = createMockChildProcess();
      vi.mocked(mockSpawn).mockReturnValue(mockProc as any);

      const executePromise = executor.execute('Test', { silent: true });
      emitJsonlLines(mockProc, [assistantMessage('OK'), resultEvent('s-1')], null, 0);

      await executePromise;

      const spawnArgs = vi.mocked(mockSpawn).mock.calls[0][1] as string[];
      expect(spawnArgs).not.toContain('--model');
    });

    // --- cwd option ---

    it('should set cwd in spawn options when cwd is provided', async () => {
      const mockProc = createMockChildProcess();
      vi.mocked(mockSpawn).mockReturnValue(mockProc as any);

      const executePromise = executor.execute('Test', {
        cwd: '/some/project',
        silent: true,
      });
      emitJsonlLines(mockProc, [assistantMessage('OK'), resultEvent('s-1')], null, 0);

      await executePromise;

      const spawnOpts = vi.mocked(mockSpawn).mock.calls[0][2] as Record<string, unknown>;
      expect(spawnOpts.cwd).toBe('/some/project');
    });

    // --- Session resume ---

    it('should append --resume=<sessionId> when resumeSession is provided', async () => {
      const mockProc = createMockChildProcess();
      vi.mocked(mockSpawn).mockReturnValue(mockProc as any);

      const executePromise = executor.execute('Continue', {
        resumeSession: 'session-abc-123',
        silent: true,
      });
      emitJsonlLines(
        mockProc,
        [assistantMessage('Resumed'), resultEvent('session-abc-123')],
        null,
        0
      );

      await executePromise;

      const spawnArgs = vi.mocked(mockSpawn).mock.calls[0][1] as string[];
      expect(spawnArgs).toContain('--resume=session-abc-123');
    });

    it('should NOT include --resume when resumeSession is not provided', async () => {
      const mockProc = createMockChildProcess();
      vi.mocked(mockSpawn).mockReturnValue(mockProc as any);

      const executePromise = executor.execute('Fresh start', { silent: true });
      emitJsonlLines(mockProc, [assistantMessage('OK'), resultEvent('s-1')], null, 0);

      await executePromise;

      const spawnArgs = vi.mocked(mockSpawn).mock.calls[0][1] as string[];
      expect(spawnArgs.some((a) => a.startsWith('--resume'))).toBe(false);
    });

    // --- Authentication ---

    it('should throw when authConfig uses token auth method', async () => {
      const authConfig: AgentConfig = {
        type: AgentType.CopilotCli,
        authMethod: 'token' as any,
        token: 'some-token',
      };
      const tokenExecutor = new CopilotCliExecutorService(mockSpawn, authConfig);

      await expect(tokenExecutor.execute('Test', { silent: true })).rejects.toThrow(
        /does not support token-based authentication/i
      );
    });

    it('should include copilot auth login instructions in token auth error', async () => {
      const authConfig: AgentConfig = {
        type: AgentType.CopilotCli,
        authMethod: 'token' as any,
        token: 'some-token',
      };
      const tokenExecutor = new CopilotCliExecutorService(mockSpawn, authConfig);

      await expect(tokenExecutor.execute('Test', { silent: true })).rejects.toThrow(
        /copilot auth login/i
      );
    });

    it('should NOT inject any auth env variable for session auth', async () => {
      // Test hermeticity: the executor forwards `process.env` untouched
      // (minus CLAUDECODE), so this assertion can be polluted by whatever
      // the developer/CI runner has in their shell. Save and clear the
      // env vars we care about, then restore after the test so other
      // suites running in the same worker aren't affected.
      const originalGithubToken = process.env.GITHUB_TOKEN;
      const originalCopilotKey = process.env.COPILOT_API_KEY;
      delete process.env.GITHUB_TOKEN;
      delete process.env.COPILOT_API_KEY;

      try {
        const authConfig: AgentConfig = {
          type: AgentType.CopilotCli,
          authMethod: 'session' as any,
        };
        const sessionExecutor = new CopilotCliExecutorService(mockSpawn, authConfig);
        const mockProc = createMockChildProcess();
        vi.mocked(mockSpawn).mockReturnValue(mockProc as any);

        const executePromise = sessionExecutor.execute('Test', { silent: true });
        emitJsonlLines(mockProc, [assistantMessage('OK'), resultEvent('s-1')], null, 0);

        await executePromise;

        const spawnOpts = vi.mocked(mockSpawn).mock.calls[0][2] as Record<string, unknown>;
        const env = spawnOpts.env as Record<string, string>;
        // No Copilot-specific auth env var should be injected
        expect(env.COPILOT_API_KEY).toBeUndefined();
        expect(env.GITHUB_TOKEN).toBeUndefined();
      } finally {
        if (originalGithubToken !== undefined) process.env.GITHUB_TOKEN = originalGithubToken;
        if (originalCopilotKey !== undefined) process.env.COPILOT_API_KEY = originalCopilotKey;
      }
    });

    it('should strip CLAUDECODE from spawn environment', async () => {
      const originalEnv = process.env.CLAUDECODE;
      process.env.CLAUDECODE = 'some-value';

      const mockProc = createMockChildProcess();
      vi.mocked(mockSpawn).mockReturnValue(mockProc as any);

      const executePromise = executor.execute('Test', { silent: true });
      emitJsonlLines(mockProc, [assistantMessage('OK'), resultEvent('s-1')], null, 0);

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
        const error = new Error('spawn copilot ENOENT') as Error & { code: string };
        error.code = 'ENOENT';
        mockProc.emit('error', error);
      });

      await expect(executePromise).rejects.toThrow(/GitHub Copilot CLI.*not found/i);
    });

    it('should include npm install instructions in ENOENT error', async () => {
      const mockProc = createMockChildProcess();
      vi.mocked(mockSpawn).mockReturnValue(mockProc as any);

      const executePromise = executor.execute('Test', { silent: true });

      process.nextTick(() => {
        const error = new Error('spawn copilot ENOENT') as Error & { code: string };
        error.code = 'ENOENT';
        mockProc.emit('error', error);
      });

      await expect(executePromise).rejects.toThrow(/npm install/i);
    });

    it('should reject with stderr content on non-zero exit code', async () => {
      const mockProc = createMockChildProcess();
      vi.mocked(mockSpawn).mockReturnValue(mockProc as any);

      const executePromise = executor.execute('Bad prompt', { silent: true });
      emitJsonlLines(mockProc, [], 'Something went wrong', 1);

      await expect(executePromise).rejects.toThrow('Process exited with code 1');
    });

    it('should include stderr in error message on non-zero exit', async () => {
      const mockProc = createMockChildProcess();
      vi.mocked(mockSpawn).mockReturnValue(mockProc as any);

      const executePromise = executor.execute('Bad prompt', { silent: true });
      emitJsonlLines(mockProc, [], 'Unexpected failure', 1);

      await expect(executePromise).rejects.toThrow('Unexpected failure');
    });

    it('should surface auth error instructions when stderr contains auth message', async () => {
      const mockProc = createMockChildProcess();
      vi.mocked(mockSpawn).mockReturnValue(mockProc as any);

      const executePromise = executor.execute('Test', { silent: true });
      emitJsonlLines(mockProc, [], 'Error: not logged in to GitHub Copilot', 1);

      await expect(executePromise).rejects.toThrow(/copilot auth login/i);
    });

    it('should skip malformed JSON lines gracefully', async () => {
      const mockProc = createMockChildProcess();
      vi.mocked(mockSpawn).mockReturnValue(mockProc as any);

      const executePromise = executor.execute('Prompt', { silent: true });
      emitJsonlLines(
        mockProc,
        ['this is not valid json {{{', assistantMessage('Real result'), resultEvent('s-1')],
        null,
        0
      );

      const result = await executePromise;
      expect(result.result).toBe('Real result');
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

      // Should resolve without error even if empty
      const result = await executePromise;
      expect(result.result).toBe('');
    });

    it('should handle line buffering across chunk boundaries', async () => {
      const mockProc = createMockChildProcess();
      vi.mocked(mockSpawn).mockReturnValue(mockProc as any);

      const executePromise = executor.execute('Prompt', { silent: true });

      process.nextTick(() => {
        // Simulate chunks that split across JSONL lines
        const full = assistantMessage('Split response');
        const half1 = full.slice(0, 10);
        const half2 = `${full.slice(10)}\n${resultEvent('s-1')}\n`;

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
      emitJsonlLines(mockProc, [assistantMessage('OK'), resultEvent('s-1')], null, 0);

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
    it('should yield progress events from assistant.message_delta', async () => {
      const mockProc = createMockChildProcess();
      vi.mocked(mockSpawn).mockReturnValue(mockProc as any);

      const events: { type: string; content: string }[] = [];
      const gen = executor.executeStream('Hello', { silent: true });

      process.nextTick(() => {
        mockProc.stdout.write(`${messageDelta('He')}\n`);
        mockProc.stdout.write(`${messageDelta('llo')}\n`);
        mockProc.stdout.write(`${assistantMessage('Hello')}\n`);
        mockProc.stdout.write(`${resultEvent('s-1')}\n`);
        mockProc.stdout.end();
        mockProc.stderr.end();
        mockProc.emit('close', 0);
      });

      for await (const event of gen) {
        events.push({ type: event.type, content: event.content });
      }

      const progressEvents = events.filter((e) => e.type === 'progress');
      expect(progressEvents).toContainEqual({ type: 'progress', content: 'He' });
      expect(progressEvents).toContainEqual({ type: 'progress', content: 'llo' });
    });

    it('should yield a result event from the result JSONL event', async () => {
      const mockProc = createMockChildProcess();
      vi.mocked(mockSpawn).mockReturnValue(mockProc as any);

      const events: { type: string; content: string }[] = [];
      const gen = executor.executeStream('Prompt', { silent: true });

      process.nextTick(() => {
        mockProc.stdout.write(`${assistantMessage('Final response')}\n`);
        mockProc.stdout.write(`${resultEvent('s-1')}\n`);
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

    it('should yield an error event on non-zero exit code', async () => {
      const mockProc = createMockChildProcess();
      vi.mocked(mockSpawn).mockReturnValue(mockProc as any);

      const events: { type: string }[] = [];
      const gen = executor.executeStream('Prompt', { silent: true });

      process.nextTick(() => {
        mockProc.stdout.end();
        mockProc.stderr.write('Internal server error');
        mockProc.stderr.end();
        mockProc.emit('close', 1);
      });

      for await (const event of gen) {
        events.push({ type: event.type });
      }

      expect(events.some((e) => e.type === 'error')).toBe(true);
    });

    it('should yield an error event for token auth in streaming mode', async () => {
      const authConfig: AgentConfig = {
        type: AgentType.CopilotCli,
        authMethod: 'token' as any,
        token: 'some-token',
      };
      const tokenExecutor = new CopilotCliExecutorService(mockSpawn, authConfig);

      const events: { type: string; content: string }[] = [];
      for await (const event of tokenExecutor.executeStream('Test', { silent: true })) {
        events.push({ type: event.type, content: event.content });
      }

      expect(events).toHaveLength(1);
      expect(events[0].type).toBe('error');
      expect(events[0].content).toMatch(/does not support token-based authentication/i);
    });

    it('should yield auth error event when copilot stderr contains auth message', async () => {
      const mockProc = createMockChildProcess();
      vi.mocked(mockSpawn).mockReturnValue(mockProc as any);

      const events: { type: string; content: string }[] = [];
      const gen = executor.executeStream('Prompt', { silent: true });

      process.nextTick(() => {
        mockProc.stdout.end();
        mockProc.stderr.write('Error: not logged in to GitHub Copilot');
        mockProc.stderr.end();
        mockProc.emit('close', 1);
      });

      for await (const event of gen) {
        events.push({ type: event.type, content: event.content });
      }

      const errorEvents = events.filter((e) => e.type === 'error');
      expect(errorEvents.length).toBeGreaterThan(0);
      expect(errorEvents[0].content).toMatch(/copilot auth login/i);
    });

    it('should apply timeout and kill subprocess in stream mode', async () => {
      vi.useFakeTimers();
      const mockProc = createMockChildProcess();
      vi.mocked(mockSpawn).mockReturnValue(mockProc as any);

      const events: { type: string; content: string }[] = [];
      const gen = executor.executeStream('Long running', { timeout: 3000, silent: true });

      const collectPromise = (async () => {
        for await (const event of gen) {
          events.push({ type: event.type, content: event.content });
        }
      })();

      vi.advanceTimersByTime(3001);

      await collectPromise;

      expect(mockProc.kill).toHaveBeenCalled();
      expect(events.some((e) => e.type === 'error' && /timed out/i.test(e.content))).toBe(true);

      vi.useRealTimers();
    });

    it('should handle non-JSON lines as raw progress in stream mode', async () => {
      const mockProc = createMockChildProcess();
      vi.mocked(mockSpawn).mockReturnValue(mockProc as any);

      const events: { type: string; content: string }[] = [];
      const gen = executor.executeStream('Prompt', { silent: true });

      process.nextTick(() => {
        mockProc.stdout.write('not valid json\n');
        mockProc.stdout.write(`${assistantMessage('OK')}\n`);
        mockProc.stdout.write(`${resultEvent('s-1')}\n`);
        mockProc.stdout.end();
        mockProc.stderr.end();
        mockProc.emit('close', 0);
      });

      for await (const event of gen) {
        events.push({ type: event.type, content: event.content });
      }

      expect(events.some((e) => e.type === 'progress' && e.content === 'not valid json')).toBe(
        true
      );
    });

    it('should include all base flags in stream mode invocation', async () => {
      const mockProc = createMockChildProcess();
      vi.mocked(mockSpawn).mockReturnValue(mockProc as any);

      const gen = executor.executeStream('Test', { silent: true });

      process.nextTick(() => {
        mockProc.stdout.write(`${assistantMessage('OK')}\n`);
        mockProc.stdout.write(`${resultEvent('s-1')}\n`);
        mockProc.stdout.end();
        mockProc.stderr.end();
        mockProc.emit('close', 0);
      });

      for await (const _ of gen) {
        // consume
      }

      const spawnArgs = vi.mocked(mockSpawn).mock.calls[0][1] as string[];
      expect(spawnArgs).toContain('--allow-all');
      expect(spawnArgs).toContain('--output-format');
      expect(spawnArgs).toContain('json');
      expect(spawnArgs).toContain('-s');
    });

    it('should append --resume=<sessionId> in stream mode when resumeSession is provided', async () => {
      const mockProc = createMockChildProcess();
      vi.mocked(mockSpawn).mockReturnValue(mockProc as any);

      const gen = executor.executeStream('Continue', {
        resumeSession: 'resume-session-xyz',
        silent: true,
      });

      process.nextTick(() => {
        mockProc.stdout.write(`${assistantMessage('Continued')}\n`);
        mockProc.stdout.write(`${resultEvent('resume-session-xyz')}\n`);
        mockProc.stdout.end();
        mockProc.stderr.end();
        mockProc.emit('close', 0);
      });

      for await (const _ of gen) {
        // consume
      }

      const spawnArgs = vi.mocked(mockSpawn).mock.calls[0][1] as string[];
      expect(spawnArgs).toContain('--resume=resume-session-xyz');
    });

    it('should use file indirection for very large prompts in stream mode', async () => {
      const mockProc = createMockChildProcess();
      vi.mocked(mockSpawn).mockReturnValue(mockProc as any);
      const largePrompt = 'x'.repeat(50_000);

      const gen = executor.executeStream(largePrompt, { silent: true });

      const collectPromise = (async () => {
        for await (const _ of gen) {
          // consume
        }
      })();

      await vi.waitFor(() => {
        expect(vi.mocked(mockSpawn)).toHaveBeenCalledTimes(1);
      });

      process.nextTick(() => {
        mockProc.stdout.write(`${assistantMessage('OK')}\n`);
        mockProc.stdout.write(`${resultEvent('s-1')}\n`);
        mockProc.stdout.end();
        mockProc.stderr.end();
        mockProc.emit('close', 0);
      });

      await collectPromise;

      const spawnArgs = vi.mocked(mockSpawn).mock.calls[0][1] as string[];
      expect(spawnArgs[0]).toBe('-p');
      expect(spawnArgs[1]).not.toBe(largePrompt);
      expect(spawnArgs[1]).toContain('The full original user prompt is stored in this file:');
    });
  });
});
