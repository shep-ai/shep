/**
 * Process Stream Helpers Unit Tests
 *
 * Covers the shared newline-delimited-output accumulator and the cross-platform
 * process-tree kill used by the CLI agent executors.
 *
 * TDD Phase: RED-GREEN
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { EventEmitter } from 'node:events';
import {
  SIGKILL_GRACE_MS,
  agentTimeoutMessage,
  buildSpawnOptions,
  classifySpawnError,
  createLineAccumulator,
  createStderrTail,
  killProcessTree,
  signalTerminationMessage,
  terminateWithEscalation,
  writePromptToStdin,
} from '@/infrastructure/services/agents/common/executors/process-stream.js';

describe('createLineAccumulator', () => {
  it('should emit one callback per complete line', () => {
    const lines: string[] = [];
    const acc = createLineAccumulator((l) => lines.push(l));

    acc.push('alpha\nbeta\n');

    expect(lines).toEqual(['alpha', 'beta']);
  });

  it('should hold back a partial line until its newline arrives', () => {
    const lines: string[] = [];
    const acc = createLineAccumulator((l) => lines.push(l));

    acc.push('par');
    expect(lines).toEqual([]);

    acc.push('tial\n');
    expect(lines).toEqual(['partial']);
  });

  it('should reassemble a JSON object split across three chunks', () => {
    const lines: string[] = [];
    const acc = createLineAccumulator((l) => lines.push(l));
    const payload = JSON.stringify({ role: 'assistant', content: 'hello world' });

    acc.push(payload.slice(0, 10));
    acc.push(payload.slice(10, 25));
    acc.push(`${payload.slice(25)}\n`);

    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0])).toEqual({ role: 'assistant', content: 'hello world' });
  });

  it('should accept Buffer chunks', () => {
    const lines: string[] = [];
    const acc = createLineAccumulator((l) => lines.push(l));

    acc.push(Buffer.from('from-buffer\n'));

    expect(lines).toEqual(['from-buffer']);
  });

  it('should not split a multi-byte character that straddles two Buffer chunks', () => {
    const lines: string[] = [];
    const acc = createLineAccumulator((l) => lines.push(l));
    const text = Buffer.from('café ☕\n', 'utf8');

    // Split mid-way through the multi-byte "☕" sequence.
    acc.push(text.subarray(0, 7));
    acc.push(text.subarray(7));

    expect(lines).toEqual(['café ☕']);
  });

  it('should skip blank lines', () => {
    const lines: string[] = [];
    const acc = createLineAccumulator((l) => lines.push(l));

    acc.push('one\n\n   \ntwo\n');

    expect(lines).toEqual(['one', 'two']);
  });

  it('should tolerate CRLF line endings', () => {
    const lines: string[] = [];
    const acc = createLineAccumulator((l) => lines.push(l));

    acc.push('windows\r\nlines\r\n');

    expect(lines).toEqual(['windows', 'lines']);
  });

  it('should emit the trailing partial line on flush', () => {
    const lines: string[] = [];
    const acc = createLineAccumulator((l) => lines.push(l));

    acc.push('no trailing newline');
    expect(lines).toEqual([]);

    acc.flush();
    expect(lines).toEqual(['no trailing newline']);
  });

  it('should be idempotent across repeated flushes', () => {
    const lines: string[] = [];
    const acc = createLineAccumulator((l) => lines.push(l));

    acc.push('once');
    acc.flush();
    acc.flush();

    expect(lines).toEqual(['once']);
  });

  it('should stop buffering and report overflow past the byte ceiling', () => {
    const lines: string[] = [];
    const overflows: number[] = [];
    const acc = createLineAccumulator((l) => lines.push(l), {
      maxLineBytes: 32,
      onOverflow: (dropped) => overflows.push(dropped),
    });

    // A single pathological "line" far larger than the ceiling — a wedged agent
    // streaming megabytes without a newline must not grow the heap unbounded.
    acc.push('x'.repeat(200));

    expect(overflows).toHaveLength(1);
    expect(lines).toEqual([]);

    // Recovers on the next newline rather than staying wedged forever.
    acc.push('\nrecovered\n');
    expect(lines).toEqual(['recovered']);
  });
});

describe('killProcessTree', () => {
  function fakeProc(pid: number | undefined) {
    const proc = new EventEmitter() as EventEmitter & {
      pid: number | undefined;
      kill: ReturnType<typeof vi.fn>;
    };
    proc.pid = pid;
    proc.kill = vi.fn();
    return proc;
  }

  it('should kill directly on non-Windows platforms', () => {
    const proc = fakeProc(999);
    const treeKill = vi.fn();

    killProcessTree(proc as never, { isWindows: false, treeKill });

    expect(proc.kill).toHaveBeenCalled();
    expect(treeKill).not.toHaveBeenCalled();
  });

  it('should kill the whole tree on Windows', () => {
    const proc = fakeProc(1234);
    const treeKill = vi.fn();

    killProcessTree(proc as never, { isWindows: true, treeKill });

    expect(treeKill).toHaveBeenCalledWith(1234);
    expect(proc.kill).not.toHaveBeenCalled();
  });

  it('should fall back to a direct kill when the Windows tree kill fails', () => {
    const proc = fakeProc(1234);
    const treeKill = vi.fn(() => {
      throw new Error('taskkill missing');
    });

    killProcessTree(proc as never, { isWindows: true, treeKill });

    expect(proc.kill).toHaveBeenCalled();
  });

  it('should fall back to a direct kill when the pid is unknown on Windows', () => {
    const proc = fakeProc(undefined);
    const treeKill = vi.fn();

    killProcessTree(proc as never, { isWindows: true, treeKill });

    expect(treeKill).not.toHaveBeenCalled();
    expect(proc.kill).toHaveBeenCalled();
  });

  it('should swallow an error thrown by kill on an already-dead process', () => {
    const proc = fakeProc(7);
    proc.kill = vi.fn(() => {
      throw new Error('ESRCH');
    });

    expect(() =>
      killProcessTree(proc as never, { isWindows: false, treeKill: vi.fn() })
    ).not.toThrow();
  });
});

describe('buildSpawnOptions', () => {
  const originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform')!;

  afterEach(() => {
    Object.defineProperty(process, 'platform', originalPlatform);
  });

  it('should always pipe all three stdio streams', () => {
    expect(buildSpawnOptions().stdio).toEqual(['pipe', 'pipe', 'pipe']);
  });

  it('should omit cwd entirely when none is requested', () => {
    expect(buildSpawnOptions()).not.toHaveProperty('cwd');
  });

  it('should pass through an explicit cwd', () => {
    expect(buildSpawnOptions({ cwd: '/work/tree' }).cwd).toBe('/work/tree');
  });

  it('should never set shell, which mangles arguments on Windows', () => {
    Object.defineProperty(process, 'platform', { value: 'win32', writable: true });

    expect(buildSpawnOptions()).not.toHaveProperty('shell');
  });

  it('should hide the console window on Windows', () => {
    Object.defineProperty(process, 'platform', { value: 'win32', writable: true });

    expect(buildSpawnOptions().windowsHide).toBe(true);
  });

  it('should not set windowsHide off Windows', () => {
    Object.defineProperty(process, 'platform', { value: 'linux', writable: true });

    expect(buildSpawnOptions()).not.toHaveProperty('windowsHide');
  });

  it('should strip CLAUDECODE so a nested agent does not refuse to start', () => {
    process.env.CLAUDECODE = '1';
    try {
      const env = buildSpawnOptions().env as Record<string, string>;
      expect(env.CLAUDECODE).toBeUndefined();
    } finally {
      delete process.env.CLAUDECODE;
    }
  });

  it('should merge extra environment variables over the inherited environment', () => {
    const env = buildSpawnOptions({ extraEnv: { AGENT_API_KEY: 'secret' } }).env as Record<
      string,
      string
    >;

    expect(env.AGENT_API_KEY).toBe('secret');
    expect(env.PATH).toBe(process.env.PATH);
  });
});

describe('classifySpawnError', () => {
  const HINT = 'Widget CLI not found. Install it with npm i -g widget.';

  it('should replace an ENOENT with the install hint', () => {
    const error = Object.assign(new Error('spawn widget ENOENT'), { code: 'ENOENT' });

    expect(classifySpawnError(error, HINT).message).toBe(HINT);
  });

  it('should return any other error unchanged', () => {
    const error = Object.assign(new Error('EACCES'), { code: 'EACCES' });

    expect(classifySpawnError(error, HINT)).toBe(error);
  });
});

describe('writePromptToStdin', () => {
  function procWithStdin(stdin: unknown) {
    return { stdin } as never;
  }

  it('should write the prompt and close stdin', () => {
    const write = vi.fn();
    const end = vi.fn();
    const stdin = Object.assign(new EventEmitter(), { write, end });

    writePromptToStdin(procWithStdin(stdin), 'the prompt');

    expect(write).toHaveBeenCalledWith('the prompt');
    expect(end).toHaveBeenCalled();
  });

  it('should swallow an EPIPE emitted after the agent exits early', () => {
    const stdin = Object.assign(new EventEmitter(), { write: vi.fn(), end: vi.fn() });

    writePromptToStdin(procWithStdin(stdin), 'the prompt');

    // Without a listener this would reach process.on('uncaughtException')
    // and kill the worker instead of failing the run.
    expect(() =>
      stdin.emit('error', Object.assign(new Error('write EPIPE'), { code: 'EPIPE' }))
    ).not.toThrow();
  });

  it('should swallow a synchronous throw from a destroyed stdin', () => {
    const stdin = Object.assign(new EventEmitter(), {
      write: vi.fn(() => {
        throw new Error('ERR_STREAM_DESTROYED');
      }),
      end: vi.fn(),
    });

    expect(() => writePromptToStdin(procWithStdin(stdin), 'the prompt')).not.toThrow();
  });

  it('should do nothing when the child has no stdin', () => {
    expect(() => writePromptToStdin(procWithStdin(null), 'the prompt')).not.toThrow();
  });
});

describe('createStderrTail', () => {
  it('should return everything written while under the ceiling', () => {
    const tail = createStderrTail();

    tail.push('first ');
    tail.push(Buffer.from('second'));

    expect(tail.text()).toBe('first second');
  });

  it('should keep only the tail once the ceiling is passed', () => {
    const tail = createStderrTail(16);

    tail.push('x'.repeat(100));
    tail.push('THE-END');

    const text = tail.text();
    expect(text.endsWith('THE-END')).toBe(true);
    expect(text.length).toBeLessThanOrEqual(16);
  });

  it('should not corrupt a multi-byte character split across two chunks', () => {
    const tail = createStderrTail();
    const bytes = Buffer.from('rate limit 日本語', 'utf8');

    tail.push(bytes.subarray(0, 13));
    tail.push(bytes.subarray(13));

    expect(tail.text()).toBe('rate limit 日本語');
  });
});

describe('terminateWithEscalation', () => {
  function fakeProc() {
    const proc = new EventEmitter() as EventEmitter & {
      pid: number;
      kill: ReturnType<typeof vi.fn>;
    };
    proc.pid = 4242;
    proc.kill = vi.fn();
    return proc;
  }

  it('should signal the process immediately', () => {
    const proc = fakeProc();

    terminateWithEscalation(proc as never, { isWindows: false, treeKill: vi.fn() });

    expect(proc.kill).toHaveBeenCalledWith();
  });

  it('should escalate to SIGKILL when the child ignores the first signal', () => {
    vi.useFakeTimers();
    try {
      const proc = fakeProc();

      terminateWithEscalation(proc as never, { isWindows: false, treeKill: vi.fn() });
      vi.advanceTimersByTime(SIGKILL_GRACE_MS);

      expect(proc.kill).toHaveBeenCalledWith('SIGKILL');
    } finally {
      vi.useRealTimers();
    }
  });

  it('should not escalate once cancelled by a clean exit', () => {
    vi.useFakeTimers();
    try {
      const proc = fakeProc();

      const cancel = terminateWithEscalation(proc as never, {
        isWindows: false,
        treeKill: vi.fn(),
      });
      cancel();
      vi.advanceTimersByTime(SIGKILL_GRACE_MS * 2);

      expect(proc.kill).not.toHaveBeenCalledWith('SIGKILL');
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('signalTerminationMessage', () => {
  it('should name the signal that killed the agent', () => {
    expect(signalTerminationMessage('SIGKILL', '')).toContain('SIGKILL');
  });

  it('should append whatever the agent managed to write to stderr', () => {
    expect(signalTerminationMessage('SIGKILL', 'out of memory')).toContain('out of memory');
  });

  it('should stay readable when the signal is unknown', () => {
    const message = signalTerminationMessage(null, '');

    expect(message).not.toContain('null');
    expect(message.length).toBeGreaterThan(0);
  });
});

describe('agentTimeoutMessage', () => {
  it('should keep the prefix retry classification matches on', () => {
    // node-helpers treats this prefix as non-retryable; changing it would
    // silently turn every timeout into a retry.
    expect(agentTimeoutMessage(300_000)).toMatch(/^Agent execution timed out/);
  });

  it('should name the budget that elapsed, in seconds', () => {
    expect(agentTimeoutMessage(300_000)).toBe('Agent execution timed out after 300s');
  });

  it('should keep sub-second budgets exact rather than rounding them to 0s', () => {
    expect(agentTimeoutMessage(1_500)).toBe('Agent execution timed out after 1.5s');
  });
});
