/**
 * stop command unit tests
 *
 * Tests for the `shep stop` CLI command.
 * Covers: no-daemon path, SIGTERM success, SIGKILL fallback, daemon.json always deleted.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Command } from 'commander';

const isWindows = process.platform === 'win32';

// Mock the daemon signal helper (must use vi.hoisted for factory reference)
const { mockSignalDaemon } = vi.hoisted(() => ({ mockSignalDaemon: vi.fn() }));
vi.mock('@/infrastructure/services/process/daemon-process-signal', () => ({
  signalDaemonProcesses: mockSignalDaemon,
}));

// Mock IDaemonService via the DI container
const mockDaemonService = {
  read: vi.fn(),
  write: vi.fn(),
  delete: vi.fn().mockResolvedValue(undefined),
  isAlive: vi.fn(),
};

vi.mock('@/infrastructure/di/container.js', () => ({
  container: {
    resolve: vi.fn().mockImplementation((token: string) => {
      if (token === 'IDaemonService') return mockDaemonService;
      throw new Error(`Unknown token: ${token}`);
    }),
  },
}));

// Mock messages to prevent stdout noise during tests
vi.mock('../../../src/presentation/cli/ui/index.js', () => ({
  messages: {
    info: vi.fn(),
    success: vi.fn(),
    warning: vi.fn(),
    error: vi.fn(),
    newline: vi.fn(),
  },
  colors: { muted: (s: string) => s },
  fmt: { code: (s: string) => s, heading: (s: string) => s },
}));

import { createStopCommand } from '../../../src/presentation/cli/commands/stop.command.js';

describe('stop command', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    mockSignalDaemon.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('command structure', () => {
    it('returns a Commander Command instance', () => {
      const cmd = createStopCommand();
      expect(cmd).toBeInstanceOf(Command);
    });

    it('has name "stop"', () => {
      const cmd = createStopCommand();
      expect(cmd.name()).toBe('stop');
    });
  });

  describe('no daemon running', () => {
    it('prints a clear message and does not signal the daemon when read() returns null', async () => {
      mockDaemonService.read.mockResolvedValue(null);

      const cmd = createStopCommand();
      await cmd.parseAsync([], { from: 'user' });

      expect(mockSignalDaemon).not.toHaveBeenCalled();
    });

    it('calls delete() even when read() returns null to clean up stale state', async () => {
      mockDaemonService.read.mockResolvedValue(null);

      const cmd = createStopCommand();
      await cmd.parseAsync([], { from: 'user' });

      // delete() is always called to ensure cleanup
      expect(mockDaemonService.delete).toHaveBeenCalled();
    });

    it('does not signal the daemon when PID is not alive', async () => {
      mockDaemonService.read.mockResolvedValue({
        pid: 99999,
        port: 4050,
        startedAt: new Date().toISOString(),
      });
      mockDaemonService.isAlive.mockReturnValue(false);

      const cmd = createStopCommand();
      await cmd.parseAsync([], { from: 'user' });

      expect(mockSignalDaemon).not.toHaveBeenCalled();
    });
  });

  describe('SIGTERM success path', () => {
    it('sends SIGTERM to the PID when daemon is alive', async () => {
      const pid = 12345;
      mockDaemonService.read.mockResolvedValue({
        pid,
        port: 4050,
        startedAt: new Date().toISOString(),
      });
      mockDaemonService.isAlive.mockReturnValue(true);

      // Simulate process dies after SIGTERM (isAlive returns false on the kill(pid,0) check)
      // First call: SIGTERM send → returns true (no throw)
      // Subsequent liveness checks via isAlive: return false (process is dead)
      mockDaemonService.isAlive
        .mockReturnValueOnce(true) // initial check in the command
        .mockReturnValue(false); // process dead after SIGTERM

      const cmd = createStopCommand();
      const parsePromise = cmd.parseAsync([], { from: 'user' });

      // Advance timers to complete the polling
      await vi.runAllTimersAsync();
      await parsePromise;

      // Windows path passes a third callback arg; Unix path is fire-and-forget.
      // Check arg-by-arg so the test passes on both.
      expect(mockSignalDaemon).toHaveBeenCalled();
      expect(mockSignalDaemon.mock.calls[0]?.[0]).toBe(pid);
      expect(mockSignalDaemon.mock.calls[0]?.[1]).toBe('SIGTERM');
    });

    it('does NOT send SIGKILL when process dies before 5s timeout', async () => {
      const pid = 12345;
      mockDaemonService.read.mockResolvedValue({
        pid,
        port: 4050,
        startedAt: new Date().toISOString(),
      });
      mockDaemonService.isAlive
        .mockReturnValueOnce(true) // initial alive check
        .mockReturnValue(false); // dead after SIGTERM

      const cmd = createStopCommand();
      const parsePromise = cmd.parseAsync([], { from: 'user' });
      await vi.runAllTimersAsync();
      await parsePromise;

      const sigkillCalls = mockSignalDaemon.mock.calls.filter(
        (call: unknown[]) => call[1] === 'SIGKILL'
      );
      expect(sigkillCalls).toHaveLength(0);
    });

    it('calls daemon service delete() after SIGTERM success', async () => {
      const pid = 12345;
      mockDaemonService.read.mockResolvedValue({
        pid,
        port: 4050,
        startedAt: new Date().toISOString(),
      });
      mockDaemonService.isAlive.mockReturnValueOnce(true).mockReturnValue(false);

      const cmd = createStopCommand();
      const parsePromise = cmd.parseAsync([], { from: 'user' });
      await vi.runAllTimersAsync();
      await parsePromise;

      expect(mockDaemonService.delete).toHaveBeenCalled();
    });
  });

  // Windows uses an always-forceful taskkill /T /F and skips the
  // graceful-then-escalate dance entirely — the SIGKILL fallback path only
  // exists on Unix.
  describe.skipIf(isWindows)('SIGKILL fallback path', () => {
    it('sends SIGKILL after 5s when process does not respond to SIGTERM', async () => {
      const pid = 12345;
      mockDaemonService.read.mockResolvedValue({
        pid,
        port: 4050,
        startedAt: new Date().toISOString(),
      });
      // Always alive — never dies
      mockDaemonService.isAlive.mockReturnValue(true);

      const cmd = createStopCommand();
      const parsePromise = cmd.parseAsync([], { from: 'user' });

      // Advance past the 5s timeout
      await vi.advanceTimersByTimeAsync(6000);
      await parsePromise;

      const sigkillCalls = mockSignalDaemon.mock.calls.filter(
        (call: unknown[]) => call[1] === 'SIGKILL'
      );
      expect(sigkillCalls.length).toBeGreaterThan(0);
      expect(sigkillCalls[0][0]).toBe(pid);
    });

    it('still calls daemon service delete() even after SIGKILL', async () => {
      const pid = 12345;
      mockDaemonService.read.mockResolvedValue({
        pid,
        port: 4050,
        startedAt: new Date().toISOString(),
      });
      mockDaemonService.isAlive.mockReturnValue(true);

      const cmd = createStopCommand();
      const parsePromise = cmd.parseAsync([], { from: 'user' });
      await vi.advanceTimersByTimeAsync(6000);
      await parsePromise;

      expect(mockDaemonService.delete).toHaveBeenCalled();
    });
  });

  describe('PID validation', () => {
    it('does not signal the daemon for a NaN PID', async () => {
      mockDaemonService.read.mockResolvedValue({
        pid: NaN,
        port: 4050,
        startedAt: new Date().toISOString(),
      });
      mockDaemonService.isAlive.mockReturnValue(false);

      const cmd = createStopCommand();
      await cmd.parseAsync([], { from: 'user' });

      expect(mockSignalDaemon).not.toHaveBeenCalled();
    });
  });

  // An agent inside a feature worktree has `shep` on its PATH; `shep stop`
  // would stop the daemon that serves the UI and schedules every feature.
  describe('inside a Shep agent run', () => {
    const saved = process.env.SHEP_AGENT_RUN_ID;
    let savedExitCode: typeof process.exitCode;

    beforeEach(() => {
      process.env.SHEP_AGENT_RUN_ID = 'run-inside';
      savedExitCode = process.exitCode;
      mockDaemonService.read.mockResolvedValue({ pid: 12345, port: 4050, startedAt: '' });
      mockDaemonService.isAlive.mockReturnValueOnce(true).mockReturnValue(false);
    });

    afterEach(() => {
      if (saved === undefined) delete process.env.SHEP_AGENT_RUN_ID;
      else process.env.SHEP_AGENT_RUN_ID = saved;
      process.exitCode = savedExitCode;
    });

    it('refuses without --force and never signals the daemon', async () => {
      const cmd = createStopCommand();
      const parsePromise = cmd.parseAsync([], { from: 'user' });
      await vi.runAllTimersAsync();
      await parsePromise;

      expect(mockSignalDaemon).not.toHaveBeenCalled();
      expect(process.exitCode).toBe(1);
    });

    it('stops the daemon with --force', async () => {
      const cmd = createStopCommand();
      const parsePromise = cmd.parseAsync(['--force'], { from: 'user' });
      await vi.runAllTimersAsync();
      await parsePromise;

      expect(mockSignalDaemon).toHaveBeenCalled();
    });
  });
});
