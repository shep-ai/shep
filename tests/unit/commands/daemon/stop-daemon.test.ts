/**
 * stopDaemon() Helper Unit Tests
 *
 * Tests for the shared daemon-stop helper.
 * Covers: SIGTERM path, SIGKILL fallback (Unix only), not-running path,
 * invalid PID path. Signals go through `signalDaemonProcesses`, which reaches
 * the daemon and its own process group but never the feature workers it
 * forked (real processes: tests/integration/services/
 * stop-daemon.feature-workers.test.ts).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { IDaemonService } from '@/application/ports/output/services/daemon-service.interface.js';

const isWindows = process.platform === 'win32';

// Mock the daemon signal helper (must use vi.hoisted for factory reference)
const { mockSignalDaemon } = vi.hoisted(() => ({ mockSignalDaemon: vi.fn() }));
vi.mock('@/infrastructure/services/process/daemon-process-signal', () => ({
  signalDaemonProcesses: mockSignalDaemon,
}));

// Mock messages to prevent stdout noise
vi.mock('../../../../src/presentation/cli/ui/index.js', () => ({
  messages: {
    info: vi.fn(),
    success: vi.fn(),
    warning: vi.fn(),
    error: vi.fn(),
    newline: vi.fn(),
  },
  fmt: { code: (s: string) => s },
}));

// Import after mocks
import { stopDaemon } from '../../../../src/presentation/cli/commands/daemon/stop-daemon.js';

function makeDaemonService(overrides: Partial<IDaemonService> = {}): IDaemonService {
  return {
    read: vi.fn().mockResolvedValue(null),
    write: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(undefined),
    isAlive: vi.fn().mockReturnValue(false),
    ...overrides,
  } as unknown as IDaemonService;
}

describe('stopDaemon()', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    mockSignalDaemon.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('no daemon running (null state)', () => {
    it('does not call process.kill when read() returns null', async () => {
      const daemonService = makeDaemonService({ read: vi.fn().mockResolvedValue(null) });

      const p = stopDaemon(daemonService);
      await vi.runAllTimersAsync();
      await p;

      expect(mockSignalDaemon).not.toHaveBeenCalled();
    });

    it('calls delete() silently when read() returns null', async () => {
      const daemonService = makeDaemonService({ read: vi.fn().mockResolvedValue(null) });

      const p = stopDaemon(daemonService);
      await vi.runAllTimersAsync();
      await p;

      expect(daemonService.delete).toHaveBeenCalled();
    });

    it('does not throw when read() returns null', async () => {
      const daemonService = makeDaemonService({ read: vi.fn().mockResolvedValue(null) });

      const p = stopDaemon(daemonService);
      await vi.runAllTimersAsync();
      await expect(p).resolves.toBeUndefined();
    });
  });

  describe('daemon state exists but not alive (isAlive returns false)', () => {
    it('does not call process.kill when isAlive returns false', async () => {
      const daemonService = makeDaemonService({
        read: vi
          .fn()
          .mockResolvedValue({ pid: 99999, port: 4050, startedAt: new Date().toISOString() }),
        isAlive: vi.fn().mockReturnValue(false),
      });

      const p = stopDaemon(daemonService);
      await vi.runAllTimersAsync();
      await p;

      expect(mockSignalDaemon).not.toHaveBeenCalled();
    });

    it('calls delete() silently when isAlive returns false', async () => {
      const daemonService = makeDaemonService({
        read: vi
          .fn()
          .mockResolvedValue({ pid: 99999, port: 4050, startedAt: new Date().toISOString() }),
        isAlive: vi.fn().mockReturnValue(false),
      });

      const p = stopDaemon(daemonService);
      await vi.runAllTimersAsync();
      await p;

      expect(daemonService.delete).toHaveBeenCalled();
    });
  });

  describe('invalid PID in state', () => {
    it.each([
      ['NaN', NaN],
      ['zero', 0],
      ['negative', -1],
      ['Infinity', Infinity],
    ])('does not call process.kill for PID = %s', async (_label, pid) => {
      const daemonService = makeDaemonService({
        read: vi.fn().mockResolvedValue({ pid, port: 4050, startedAt: new Date().toISOString() }),
        isAlive: vi.fn().mockReturnValue(false),
      });

      const p = stopDaemon(daemonService);
      await vi.runAllTimersAsync();
      await p;

      expect(mockSignalDaemon).not.toHaveBeenCalled();
    });

    it('calls delete() for invalid PID to clean up stale daemon.json', async () => {
      const daemonService = makeDaemonService({
        read: vi
          .fn()
          .mockResolvedValue({ pid: 0, port: 4050, startedAt: new Date().toISOString() }),
        isAlive: vi.fn().mockReturnValue(false),
      });

      const p = stopDaemon(daemonService);
      await vi.runAllTimersAsync();
      await p;

      expect(daemonService.delete).toHaveBeenCalled();
    });
  });

  describe('SIGTERM success path (process dies within grace window)', () => {
    it('sends SIGTERM to the daemon PID', async () => {
      const pid = 12345;
      const isAlive = vi
        .fn()
        .mockReturnValueOnce(true) // initial alive check
        .mockReturnValue(false); // dead after SIGTERM

      const daemonService = makeDaemonService({
        read: vi.fn().mockResolvedValue({ pid, port: 4050, startedAt: new Date().toISOString() }),
        isAlive,
      });

      const p = stopDaemon(daemonService);
      await vi.runAllTimersAsync();
      await p;

      expect(mockSignalDaemon).toHaveBeenCalled();
      expect(mockSignalDaemon.mock.calls[0]?.[0]).toBe(pid);
      expect(mockSignalDaemon.mock.calls[0]?.[1]).toBe('SIGTERM');
    });

    it('does NOT send SIGKILL when process dies before grace window expires', async () => {
      const pid = 12345;
      const isAlive = vi.fn().mockReturnValueOnce(true).mockReturnValue(false);

      const daemonService = makeDaemonService({
        read: vi.fn().mockResolvedValue({ pid, port: 4050, startedAt: new Date().toISOString() }),
        isAlive,
      });

      const p = stopDaemon(daemonService);
      await vi.runAllTimersAsync();
      await p;

      const sigkillCalls = mockSignalDaemon.mock.calls.filter(
        (call: unknown[]) => call[1] === 'SIGKILL'
      );
      expect(sigkillCalls).toHaveLength(0);
    });

    it('calls delete() after SIGTERM success to clean up daemon.json', async () => {
      const pid = 12345;
      const isAlive = vi.fn().mockReturnValueOnce(true).mockReturnValue(false);

      const daemonService = makeDaemonService({
        read: vi.fn().mockResolvedValue({ pid, port: 4050, startedAt: new Date().toISOString() }),
        isAlive,
      });

      const p = stopDaemon(daemonService);
      await vi.runAllTimersAsync();
      await p;

      expect(daemonService.delete).toHaveBeenCalled();
    });
  });

  // Windows uses an always-forceful taskkill /F and skips the
  // graceful-then-escalate dance entirely — the SIGKILL fallback path only
  // exists on Unix.
  describe.skipIf(isWindows)('SIGKILL fallback path (grace window expires)', () => {
    it('sends SIGKILL after 5s when process does not respond to SIGTERM', async () => {
      const pid = 12345;
      // Always alive — never responds to SIGTERM
      const daemonService = makeDaemonService({
        read: vi.fn().mockResolvedValue({ pid, port: 4050, startedAt: new Date().toISOString() }),
        isAlive: vi.fn().mockReturnValue(true),
      });

      const p = stopDaemon(daemonService);
      await vi.advanceTimersByTimeAsync(6000);
      await p;

      const sigkillCalls = mockSignalDaemon.mock.calls.filter(
        (call: unknown[]) => call[1] === 'SIGKILL'
      );
      expect(sigkillCalls.length).toBeGreaterThan(0);
      expect(sigkillCalls[0][0]).toBe(pid);
    });

    it('calls delete() even after SIGKILL path', async () => {
      const pid = 12345;
      const daemonService = makeDaemonService({
        read: vi.fn().mockResolvedValue({ pid, port: 4050, startedAt: new Date().toISOString() }),
        isAlive: vi.fn().mockReturnValue(true),
      });

      const p = stopDaemon(daemonService);
      await vi.advanceTimersByTimeAsync(6000);
      await p;

      expect(daemonService.delete).toHaveBeenCalled();
    });

    it('does not throw if the daemon exits right before the SIGKILL', async () => {
      const pid = 12345;
      const daemonService = makeDaemonService({
        read: vi.fn().mockResolvedValue({ pid, port: 4050, startedAt: new Date().toISOString() }),
        isAlive: vi.fn().mockReturnValue(true),
      });

      // The helper swallows ESRCH; the daemon being gone is the expected case.
      mockSignalDaemon.mockResolvedValue(undefined);

      const p = stopDaemon(daemonService);
      await vi.advanceTimersByTimeAsync(6000);
      await expect(p).resolves.toBeUndefined();
    });
  });
});
