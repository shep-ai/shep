/**
 * Post-Result Exit Guard Unit Tests
 *
 * An agent CLI that emitted its terminal event (Claude/Copilot/Cursor/Gemini
 * `result`, Codex `turn.completed`) is done, but it routinely lingers — MCP
 * children, language servers and backgrounded dev servers keep it alive. The
 * guard bounds that teardown so a finished run can never hang.
 *
 * TDD Phase: RED-GREEN
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { SIGKILL_GRACE_MS } from '@/infrastructure/services/agents/common/executors/process-stream.js';
import {
  RESULT_TO_CLOSE_GRACE_MS,
  watchPostResultExit,
} from '@/infrastructure/services/agents/common/executors/post-result-exit.js';

/** A fake child with the fields the guard reads, emitting events like Node. */
function fakeProc() {
  const proc = new EventEmitter() as EventEmitter & {
    pid: number;
    kill: ReturnType<typeof vi.fn>;
    stdout: PassThrough;
    stderr: PassThrough;
    exitCode: number | null;
    signalCode: NodeJS.Signals | null;
  };
  proc.pid = 4242;
  proc.kill = vi.fn();
  proc.stdout = new PassThrough();
  proc.stderr = new PassThrough();
  proc.exitCode = null;
  proc.signalCode = null;
  return proc;
}

/** Real Node order: stdio ends before the process reports `close`. */
function close(proc: ReturnType<typeof fakeProc>, code: number | null, signal: string | null) {
  proc.stdout.end();
  proc.stderr.end();
  proc.emit('close', code, signal);
}

const LINUX = { isWindows: false, treeKill: vi.fn() };

describe('watchPostResultExit', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should leave a process alone until the terminal event arms it', () => {
    const proc = fakeProc();

    watchPostResultExit(proc as never, vi.fn(), LINUX);
    vi.advanceTimersByTime(RESULT_TO_CLOSE_GRACE_MS * 10);

    expect(proc.kill).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('should terminate a process still running when the grace period ends', () => {
    const proc = fakeProc();
    const log = vi.fn();

    const guard = watchPostResultExit(proc as never, log, LINUX);
    guard.arm();

    vi.advanceTimersByTime(RESULT_TO_CLOSE_GRACE_MS - 1);
    expect(proc.kill).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(proc.kill).toHaveBeenCalledTimes(1);
    expect(guard.killed).toBe(true);
    expect(log).toHaveBeenCalledWith(
      expect.stringMatching(/did not exit within 30s of \[result\]/)
    );
  });

  it('should escalate to SIGKILL when the lingering process ignores the first signal', () => {
    const proc = fakeProc();

    watchPostResultExit(proc as never, vi.fn(), LINUX).arm();
    vi.advanceTimersByTime(RESULT_TO_CLOSE_GRACE_MS + SIGKILL_GRACE_MS);

    expect(proc.kill).toHaveBeenCalledWith('SIGKILL');
  });

  it('should kill the whole process tree on Windows', () => {
    const proc = fakeProc();
    const treeKill = vi.fn();

    watchPostResultExit(proc as never, vi.fn(), { isWindows: true, treeKill }).arm();
    vi.advanceTimersByTime(RESULT_TO_CLOSE_GRACE_MS);

    expect(treeKill).toHaveBeenCalledWith(4242);
  });

  it('should never kill a process that exits on its own within the grace period', () => {
    const proc = fakeProc();

    const guard = watchPostResultExit(proc as never, vi.fn(), LINUX);
    guard.arm();
    vi.advanceTimersByTime(RESULT_TO_CLOSE_GRACE_MS / 2);
    close(proc, 0, null);
    vi.advanceTimersByTime(RESULT_TO_CLOSE_GRACE_MS * 2);

    expect(proc.kill).not.toHaveBeenCalled();
    expect(guard.killed).toBe(false);
    // No timer may outlive the run it belonged to.
    expect(vi.getTimerCount()).toBe(0);
  });

  it('should cancel the SIGKILL escalation once the killed process closes', () => {
    const proc = fakeProc();

    watchPostResultExit(proc as never, vi.fn(), LINUX).arm();
    vi.advanceTimersByTime(RESULT_TO_CLOSE_GRACE_MS);
    close(proc, null, 'SIGTERM');
    vi.advanceTimersByTime(SIGKILL_GRACE_MS * 2);

    // The pid may already belong to another process by then.
    expect(proc.kill).not.toHaveBeenCalledWith('SIGKILL');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('should cancel a pending kill when the process fails with an error event', () => {
    const proc = fakeProc();

    watchPostResultExit(proc as never, vi.fn(), LINUX).arm();
    proc.emit('error', new Error('boom'));
    vi.advanceTimersByTime(RESULT_TO_CLOSE_GRACE_MS * 2);

    expect(proc.kill).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('should arm only once when the terminal event is seen twice', () => {
    const proc = fakeProc();

    const guard = watchPostResultExit(proc as never, vi.fn(), LINUX);
    guard.arm();
    vi.advanceTimersByTime(RESULT_TO_CLOSE_GRACE_MS / 2);
    // A second event must not push the deadline back.
    guard.arm();
    expect(vi.getTimerCount()).toBe(1);

    vi.advanceTimersByTime(RESULT_TO_CLOSE_GRACE_MS / 2);
    expect(proc.kill).toHaveBeenCalledTimes(1);

    // Nor may one after the kill signal the process a second time.
    guard.arm();
    vi.advanceTimersByTime(RESULT_TO_CLOSE_GRACE_MS);
    expect(proc.kill.mock.calls.filter((call) => call.length === 0)).toHaveLength(1);
  });

  it('should not arm after the process already closed', () => {
    const proc = fakeProc();

    const guard = watchPostResultExit(proc as never, vi.fn(), LINUX);
    close(proc, 0, null);
    guard.arm();

    expect(vi.getTimerCount()).toBe(0);
  });

  it('should cancel a pending kill when stopped by its owner', () => {
    const proc = fakeProc();

    const guard = watchPostResultExit(proc as never, vi.fn(), LINUX);
    guard.arm();
    guard.stop();
    guard.stop();
    vi.advanceTimersByTime(RESULT_TO_CLOSE_GRACE_MS * 2);

    expect(proc.kill).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('should honour a custom grace period and name the terminal event in its log', () => {
    const proc = fakeProc();
    const log = vi.fn();

    watchPostResultExit(proc as never, log, {
      ...LINUX,
      graceMs: 1_000,
      terminalEvent: 'turn.completed',
    }).arm();
    vi.advanceTimersByTime(1_000);

    expect(proc.kill).toHaveBeenCalledTimes(1);
    expect(log).toHaveBeenCalledWith(expect.stringContaining('1s of [turn.completed]'));
  });

  it('should not keep the worker alive on its own', () => {
    const proc = fakeProc();
    const unref = vi.fn();
    const realSetTimeout = globalThis.setTimeout;
    const spy = vi.spyOn(globalThis, 'setTimeout').mockImplementation(((
      ...args: Parameters<typeof setTimeout>
    ) => {
      const handle = realSetTimeout(...args);
      vi.spyOn(handle, 'unref').mockImplementation(() => {
        unref();
        return handle;
      });
      return handle;
    }) as typeof setTimeout);
    try {
      watchPostResultExit(proc as never, vi.fn(), LINUX).arm();
      expect(unref).toHaveBeenCalled();
    } finally {
      spy.mockRestore();
    }
  });

  describe('exit code as the outcome rules read it', () => {
    it('should pass the real exit code through when the agent exited on its own', () => {
      const guard = watchPostResultExit(fakeProc() as never, vi.fn(), LINUX);
      guard.arm();

      expect(guard.exitCode(1)).toBe(1);
      expect(guard.exitCode(0)).toBe(0);
    });

    it('should report a process its own kill ended as signal-terminated', () => {
      // taskkill makes a Windows process exit 1, and a CLI trapping SIGTERM may
      // exit non-zero: either is our teardown, not the agent's verdict.
      const guard = watchPostResultExit(fakeProc() as never, vi.fn(), LINUX);
      guard.arm();
      vi.advanceTimersByTime(RESULT_TO_CLOSE_GRACE_MS);

      expect(guard.exitCode(1)).toBeNull();
      expect(guard.exitCode(143)).toBeNull();
    });
  });

  describe('a process that exited while a leaked child holds its output open', () => {
    it('should close the held pipes instead of signalling a dead pid', () => {
      const proc = fakeProc();
      const log = vi.fn();
      const closed = vi.fn();
      proc.stdout.on('close', closed);

      const guard = watchPostResultExit(proc as never, log, LINUX);
      guard.arm();
      // 'exit' arrived, but a grandchild inherited stdout so 'close' never does.
      proc.exitCode = 0;
      vi.advanceTimersByTime(RESULT_TO_CLOSE_GRACE_MS);

      expect(proc.kill).not.toHaveBeenCalled();
      expect(proc.stdout.destroyed).toBe(true);
      expect(proc.stderr.destroyed).toBe(true);
      expect(guard.killed).toBe(false);
      expect(log).toHaveBeenCalledWith(expect.stringMatching(/output still held open/));
    });
  });
});
