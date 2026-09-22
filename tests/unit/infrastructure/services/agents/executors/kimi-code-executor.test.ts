/**
 * KimiCodeExecutorService Unit Tests
 *
 * Tests for the Moonshot AI Kimi Code CLI subprocess executor service.
 * Uses constructor-injected spawn function mock (NOT vi.mock of child_process).
 *
 * TDD Phase: RED-GREEN
 */

import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { KimiCodeExecutorService } from '@/infrastructure/services/agents/common/executors/kimi-code-executor.service.js';
import type { SpawnFunction } from '@/infrastructure/services/agents/common/types.js';
import {
  AgentType,
  AgentFeature,
  AgentAuthMethod,
  SecurityMode,
} from '@/domain/generated/output.js';
import type { AgentConfig } from '@/domain/generated/output.js';
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
  proc.pid = 4242;
  proc.kill = vi.fn();
  return proc;
}

type MockProc = ReturnType<typeof createMockChildProcess>;

/** Kimi print-mode assistant message (stream-json / JSONL). */
function assistantMessage(content: string): string {
  return JSON.stringify({ role: 'assistant', content });
}

/** Kimi print-mode assistant message carrying tool calls. */
function toolCallMessage(name: string, id = 'tc_1'): string {
  return JSON.stringify({
    role: 'assistant',
    content: '',
    tool_calls: [{ type: 'function', id, function: { name, arguments: '{}' } }],
  });
}

/** Kimi print-mode tool result message. */
function toolResultMessage(content: string, id = 'tc_1'): string {
  return JSON.stringify({ role: 'tool', tool_call_id: id, content });
}

/** Emit JSONL lines on stdout then close the process. */
function emitLines(
  proc: MockProc,
  lines: string[],
  stderrData: string | null,
  exitCode: number | null
) {
  process.nextTick(() => {
    for (const line of lines) proc.stdout.write(`${line}\n`);
    proc.stdout.end();
    if (stderrData !== null) proc.stderr.write(stderrData);
    proc.stderr.end();
    proc.emit('close', exitCode);
  });
}

/** Read the args array the spawn mock was called with. */
function spawnArgs(mockSpawn: SpawnFunction): string[] {
  return (mockSpawn as unknown as ReturnType<typeof vi.fn>).mock.calls[0][1] as string[];
}

/** Read the options object the spawn mock was called with. */
function spawnOptions(mockSpawn: SpawnFunction): Record<string, unknown> {
  return (mockSpawn as unknown as ReturnType<typeof vi.fn>).mock.calls[0][2] as Record<
    string,
    unknown
  >;
}

/** Value that follows `flag` in the spawned argv, or undefined. */
function argValue(args: string[], flag: string): string | undefined {
  const i = args.indexOf(flag);
  return i === -1 ? undefined : args[i + 1];
}

describe('KimiCodeExecutorService', () => {
  let mockSpawn: SpawnFunction;
  let proc: MockProc;
  let executor: KimiCodeExecutorService;

  beforeEach(() => {
    proc = createMockChildProcess();
    mockSpawn = vi.fn(() => proc) as unknown as SpawnFunction;
    executor = new KimiCodeExecutorService(mockSpawn);
  });

  // --- identity and capabilities -------------------------------------------

  describe('agentType', () => {
    it('should have agentType of KimiCode', () => {
      expect(executor.agentType).toBe(AgentType.KimiCode);
    });
  });

  describe('supportsFeature', () => {
    it('should support streaming', () => {
      expect(executor.supportsFeature(AgentFeature.streaming)).toBe(true);
    });

    it('should support session-resume', () => {
      expect(executor.supportsFeature(AgentFeature.sessionResume)).toBe(true);
    });

    it('should NOT claim structured-output', () => {
      expect(executor.supportsFeature(AgentFeature.structuredOutput)).toBe(false);
    });

    it('should NOT claim tool-scoping', () => {
      expect(executor.supportsFeature(AgentFeature.toolScoping)).toBe(false);
    });

    it('should NOT claim session-listing', () => {
      expect(executor.supportsFeature(AgentFeature.sessionListing)).toBe(false);
    });
  });

  // --- argv construction ----------------------------------------------------

  describe('command construction', () => {
    it('should spawn the `kimi` binary in non-interactive print mode', async () => {
      emitLines(proc, [assistantMessage('done')], null, 0);
      await executor.execute('do the thing', { silent: true });

      const [cmd] = (mockSpawn as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(cmd).toBe('kimi');

      const args = spawnArgs(mockSpawn);
      expect(args).toContain('--print');
      expect(argValue(args, '--output-format')).toBe('stream-json');
    });

    it('should auto-approve tool calls so a headless run never blocks on a prompt', async () => {
      emitLines(proc, [assistantMessage('done')], null, 0);
      await executor.execute('do the thing', { silent: true });

      expect(spawnArgs(mockSpawn)).toContain('--afk');
    });

    it('should pipe the prompt via stdin and never place it in argv', async () => {
      const secretish = 'implement the feature and use token abc123';
      const written: string[] = [];
      proc.stdin.on('data', (c: Buffer) => written.push(c.toString()));

      emitLines(proc, [assistantMessage('ok')], null, 0);
      await executor.execute(secretish, { silent: true });

      expect(written.join('')).toBe(secretish);
      expect(spawnArgs(mockSpawn)).not.toContain(secretish);
    });

    it('should pass the working directory to both the CLI and the spawn options', async () => {
      emitLines(proc, [assistantMessage('ok')], null, 0);
      await executor.execute('go', { cwd: '/tmp/worktree', silent: true });

      expect(argValue(spawnArgs(mockSpawn), '--work-dir')).toBe('/tmp/worktree');
      expect(spawnOptions(mockSpawn).cwd).toBe('/tmp/worktree');
    });

    it('should pass the model when one is requested', async () => {
      emitLines(proc, [assistantMessage('ok')], null, 0);
      await executor.execute('go', { model: 'kimi-k2.7-code', silent: true });

      expect(argValue(spawnArgs(mockSpawn), '--model')).toBe('kimi-k2.7-code');
    });

    it('should omit the model flag when no model is requested', async () => {
      emitLines(proc, [assistantMessage('ok')], null, 0);
      await executor.execute('go', { silent: true });

      expect(spawnArgs(mockSpawn)).not.toContain('--model');
    });

    it('should map maxTurns onto the per-turn step budget', async () => {
      emitLines(proc, [assistantMessage('ok')], null, 0);
      await executor.execute('go', { maxTurns: 12, silent: true });

      expect(argValue(spawnArgs(mockSpawn), '--max-steps-per-turn')).toBe('12');
    });

    it('should resume the requested session id', async () => {
      emitLines(proc, [assistantMessage('ok')], null, 0);
      const result = await executor.execute('go', { resumeSession: 'sess-abc', silent: true });

      expect(argValue(spawnArgs(mockSpawn), '--session')).toBe('sess-abc');
      expect(result.sessionId).toBe('sess-abc');
    });

    it('should mint a resumable session id when none was supplied', async () => {
      emitLines(proc, [assistantMessage('ok')], null, 0);
      const result = await executor.execute('go', { silent: true });

      const passed = argValue(spawnArgs(mockSpawn), '--session');
      expect(passed).toBeTruthy();
      expect(result.sessionId).toBe(passed);
    });

    it('should strip CLAUDECODE from the child environment', async () => {
      const previous = process.env.CLAUDECODE;
      process.env.CLAUDECODE = '1';
      try {
        emitLines(proc, [assistantMessage('ok')], null, 0);
        await executor.execute('go', { silent: true });

        const env = spawnOptions(mockSpawn).env as Record<string, string>;
        expect(env.CLAUDECODE).toBeUndefined();
      } finally {
        if (previous === undefined) delete process.env.CLAUDECODE;
        else process.env.CLAUDECODE = previous;
      }
    });
  });

  // --- credentials ----------------------------------------------------------

  describe('token authentication', () => {
    it('should pass the API key through the environment, never through argv', async () => {
      const authConfig = {
        type: AgentType.KimiCode,
        authMethod: AgentAuthMethod.Token,
        token: 'sk-kimi-secret',
      } as unknown as AgentConfig;
      executor = new KimiCodeExecutorService(mockSpawn, authConfig);

      emitLines(proc, [assistantMessage('ok')], null, 0);
      await executor.execute('go', { silent: true });

      const env = spawnOptions(mockSpawn).env as Record<string, string>;
      expect(env.KIMI_API_KEY).toBe('sk-kimi-secret');
      expect(spawnArgs(mockSpawn).join(' ')).not.toContain('sk-kimi-secret');
    });

    it('should point the CLI at the environment variable holding the key', async () => {
      const authConfig = {
        type: AgentType.KimiCode,
        authMethod: AgentAuthMethod.Token,
        token: 'sk-kimi-secret',
      } as unknown as AgentConfig;
      executor = new KimiCodeExecutorService(mockSpawn, authConfig);

      emitLines(proc, [assistantMessage('ok')], null, 0);
      await executor.execute('go', { silent: true });

      const inline = argValue(spawnArgs(mockSpawn), '--config');
      expect(inline).toBeTruthy();
      expect(JSON.parse(inline as string)).toEqual({
        providers: { kimi: { api_key_env: 'KIMI_API_KEY' } },
      });
    });

    it('should not inject credentials when using session auth', async () => {
      const authConfig = {
        type: AgentType.KimiCode,
        authMethod: AgentAuthMethod.Session,
      } as unknown as AgentConfig;
      executor = new KimiCodeExecutorService(mockSpawn, authConfig);

      emitLines(proc, [assistantMessage('ok')], null, 0);
      await executor.execute('go', { silent: true });

      expect(spawnArgs(mockSpawn)).not.toContain('--config');
    });
  });

  // --- security policy ------------------------------------------------------

  describe('security constraints', () => {
    it('should refuse to run under an enforced strict sandbox', async () => {
      await expect(
        executor.execute('go', {
          silent: true,
          securityConstraints: strictConstraints(SecurityMode.Enforce),
        })
      ).rejects.toBeInstanceOf(SecurityViolationError);

      expect(mockSpawn).not.toHaveBeenCalled();
    });

    it('should still run under an advisory strict sandbox', async () => {
      emitLines(proc, [assistantMessage('ok')], null, 0);
      const result = await executor.execute('go', {
        silent: true,
        securityConstraints: strictConstraints(SecurityMode.Advisory),
      });

      expect(result.result).toBe('ok');
    });
  });

  // --- output parsing -------------------------------------------------------

  describe('result parsing', () => {
    it('should accumulate assistant text across messages', async () => {
      emitLines(proc, [assistantMessage('Hello '), assistantMessage('world')], null, 0);
      const result = await executor.execute('go', { silent: true });

      expect(result.result).toBe('Hello world');
    });

    it('should ignore tool-call and tool-result messages in the final text', async () => {
      emitLines(
        proc,
        [toolCallMessage('ReadFile'), toolResultMessage('file contents'), assistantMessage('done')],
        null,
        0
      );
      const result = await executor.execute('go', { silent: true });

      expect(result.result).toBe('done');
    });

    it('should reassemble a JSON object split across stdout chunk boundaries', async () => {
      const line = assistantMessage('split across chunks');
      const mid = Math.floor(line.length / 2);
      process.nextTick(() => {
        proc.stdout.write(line.slice(0, mid));
        process.nextTick(() => {
          proc.stdout.write(`${line.slice(mid)}\n`);
          proc.stdout.end();
          proc.stderr.end();
          proc.emit('close', 0);
        });
      });

      const result = await executor.execute('go', { silent: true });
      expect(result.result).toBe('split across chunks');
    });

    it('should join array-shaped assistant content', async () => {
      const line = JSON.stringify({
        role: 'assistant',
        content: [
          { type: 'text', text: 'part one ' },
          { type: 'text', text: 'part two' },
        ],
      });
      emitLines(proc, [line], null, 0);

      const result = await executor.execute('go', { silent: true });
      expect(result.result).toBe('part one part two');
    });

    it('should fall back to raw text when the CLI emits non-JSON output', async () => {
      emitLines(proc, ['not json at all'], null, 0);
      const result = await executor.execute('go', { silent: true });

      expect(result.result).toBe('not json at all');
    });

    it('should flush a trailing line that arrives without a newline', async () => {
      process.nextTick(() => {
        proc.stdout.write(assistantMessage('no trailing newline'));
        proc.stdout.end();
        proc.stderr.end();
        proc.emit('close', 0);
      });

      const result = await executor.execute('go', { silent: true });
      expect(result.result).toBe('no trailing newline');
    });
  });

  // --- failure handling -----------------------------------------------------

  describe('failure handling', () => {
    it('should reject with stderr on a permanent failure exit code', async () => {
      emitLines(proc, [], 'invalid api key', 1);

      await expect(executor.execute('go', { silent: true })).rejects.toThrow(/invalid api key/);
    });

    it('should mark exit code 75 as a transient, retryable failure', async () => {
      emitLines(proc, [], 'rate limited', 75);

      await expect(executor.execute('go', { silent: true })).rejects.toThrow(/transient/i);
    });

    it('should give an actionable error when the binary is missing', async () => {
      process.nextTick(() => {
        const err = new Error('spawn kimi ENOENT') as Error & { code?: string };
        err.code = 'ENOENT';
        proc.emit('error', err);
      });

      await expect(executor.execute('go', { silent: true })).rejects.toThrow(/Kimi Code CLI/);
    });

    it('should kill the process and reject when the timeout elapses', async () => {
      // No output, no close — the timeout must fire.
      await expect(executor.execute('go', { silent: true, timeout: 20 })).rejects.toThrow(
        'Agent execution timed out after 0.02s'
      );
      expect(proc.kill).toHaveBeenCalled();
    });
  });

  // --- streaming ------------------------------------------------------------

  describe('executeStream', () => {
    it('should yield progress events for assistant text and a final result event', async () => {
      emitLines(proc, [assistantMessage('working'), assistantMessage('finished')], null, 0);

      const events = [];
      for await (const event of executor.executeStream('go', { silent: true })) {
        events.push(event);
      }

      const progress = events.filter((e) => e.type === 'progress').map((e) => e.content);
      expect(progress).toContain('working');
      expect(progress).toContain('finished');
      expect(events.at(-1)?.type).toBe('result');
    });

    it('should announce tool calls as progress', async () => {
      emitLines(proc, [toolCallMessage('WriteFile')], null, 0);

      const events = [];
      for await (const event of executor.executeStream('go', { silent: true })) {
        events.push(event);
      }

      expect(events.some((e) => e.type === 'progress' && e.content.includes('WriteFile'))).toBe(
        true
      );
    });

    it('should emit an error event when the process fails', async () => {
      emitLines(proc, [], 'boom', 1);

      const events = [];
      for await (const event of executor.executeStream('go', { silent: true })) {
        events.push(event);
      }

      expect(events.some((e) => e.type === 'error' && e.content.includes('boom'))).toBe(true);
    });
  });
  // --- defects shared with the other CLI executors --------------------------

  describe('prompt delivery', () => {
    it('should survive an EPIPE when the CLI exits before reading the prompt', async () => {
      const executePromise = executor.execute('a large prompt', { silent: true });

      expect(() =>
        proc.stdin.emit('error', Object.assign(new Error('write EPIPE'), { code: 'EPIPE' }))
      ).not.toThrow();

      emitLines(proc, [], 'bad flag', 1);
      await expect(executePromise).rejects.toThrow(/bad flag/);
    });
  });

  describe('signal termination', () => {
    // Kimi's protocol has no terminal event, so a signal kill can never be
    // told apart from a finished turn by the output — it is always a failure.
    it('should reject naming the signal when killed after partial text', async () => {
      const executePromise = executor.execute('go', { silent: true });
      process.nextTick(() => {
        for (const line of [assistantMessage('partial work')]) proc.stdout.write(`${line}\n`);
        proc.stdout.end();
        proc.stderr.end();
        proc.emit('close', null, 'SIGKILL');
      });

      await expect(executePromise).rejects.toThrow(/SIGKILL/);
    });

    it('should stream an error, not a result, when killed after partial text', async () => {
      process.nextTick(() => {
        for (const line of [assistantMessage('partial work')]) proc.stdout.write(`${line}\n`);
        proc.stdout.end();
        proc.stderr.end();
        proc.emit('close', null, 'SIGKILL');
      });
      const events: { type: string; content: string }[] = [];
      for await (const event of executor.executeStream('go', { silent: true })) {
        events.push({ type: event.type, content: event.content });
      }

      expect(events.some((e) => e.type === 'error' && e.content.includes('SIGKILL'))).toBe(true);
      expect(events.some((e) => e.type === 'result')).toBe(false);
    });

    it('should stream the timeout with its budget and no result', async () => {
      // A timeout kill reaches 'close' as a signal too; it must be reported once.
      proc.kill.mockImplementation(() => {
        process.nextTick(() => {
          proc.stdout.write(`${assistantMessage('partial work')}\n`);
          proc.stdout.end();
          proc.stderr.end();
          proc.emit('close', null, 'SIGTERM');
        });
        return true;
      });

      const events: { type: string; content: string }[] = [];
      for await (const event of executor.executeStream('go', { silent: true, timeout: 20 })) {
        events.push({ type: event.type, content: event.content });
      }

      expect(events.filter((e) => e.type === 'error')).toEqual([
        { type: 'error', content: 'Agent execution timed out after 0.02s' },
      ]);
      expect(events.some((e) => e.type === 'result')).toBe(false);
    });

    it('should reject when the CLI is killed by a signal with nothing captured', async () => {
      const executePromise = executor.execute('go', { silent: true });
      process.nextTick(() => {
        proc.stdout.end();
        proc.stderr.end();
        proc.emit('close', null, 'SIGKILL');
      });

      await expect(executePromise).rejects.toThrow(/SIGKILL/);
    });
  });

  describe('stream result mapping', () => {
    it('should report the answer as the result and the session id beside it', async () => {
      emitLines(proc, [assistantMessage('The answer is 42.')], null, 0);

      const events = [];
      for await (const event of executor.executeStream('go', {
        silent: true,
        resumeSession: 'sess-42',
      })) {
        events.push(event);
      }

      const resultEvent = events.at(-1);
      expect(resultEvent?.type).toBe('result');
      expect(resultEvent?.content).toBe('The answer is 42.');
      expect(resultEvent?.sessionId).toBe('sess-42');
    });

    it('should not fold tool-call announcements into the answer', async () => {
      emitLines(proc, [toolCallMessage('WriteFile'), assistantMessage('Patched foo.ts')], null, 0);

      const events = [];
      for await (const event of executor.executeStream('go', { silent: true })) {
        events.push(event);
      }

      expect(events.at(-1)?.content).toBe('Patched foo.ts');
    });

    it('should kill the child when the consumer stops iterating early', async () => {
      process.nextTick(() => {
        proc.stdout.write(`${assistantMessage('first')}\n`);
      });

      for await (const _event of executor.executeStream('go', { silent: true })) {
        break;
      }

      expect(proc.kill).toHaveBeenCalled();
    });
  });
});

describe('KimiCodeExecutorService — idle timeout', () => {
  // A stalled agent (hung API connection, wedged tool) used to sit out the
  // whole total budget — 30 minutes by default, hours for a long implement
  // stage. `idleTimeout` ends it after that long without any output.
  const IDLE_MESSAGE = 'Agent execution timed out: no output for 60s';
  let mockSpawn: SpawnFunction;
  let executor: KimiCodeExecutorService;

  beforeEach(() => {
    mockSpawn = vi.fn();
    executor = new KimiCodeExecutorService(mockSpawn);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('execute(): kills an agent silent for the idle budget, naming the budget', async () => {
    vi.useFakeTimers();
    const proc = createMockChildProcess();
    vi.mocked(mockSpawn).mockReturnValue(proc as any);

    const outcome = executor.execute('Prompt', { silent: true, idleTimeout: 60_000 }).then(
      () => 'resolved',
      (error: Error) => error.message
    );
    await vi.advanceTimersByTimeAsync(30_000);
    proc.stderr.write('still working\n'); // any output restarts the budget
    await vi.advanceTimersByTimeAsync(45_000);
    expect(proc.kill).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(20_000);
    expect(proc.kill).toHaveBeenCalled();
    proc.emit('close', null, 'SIGTERM');

    expect(await outcome).toBe(IDLE_MESSAGE);
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
