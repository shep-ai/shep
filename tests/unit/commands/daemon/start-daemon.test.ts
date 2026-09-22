/**
 * startDaemon() Helper Unit Tests
 *
 * Tests for the shared daemon-spawn helper used by both the default
 * `shep` action and `shep start`.
 *
 * TDD Phase: RED
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ---- Lightweight EventEmitter-like mock for ChildProcess ----------------------
type Listener = (...args: unknown[]) => void;

interface MockStream {
  on: (event: string, listener: Listener) => MockStream;
  destroy: ReturnType<typeof vi.fn>;
  _listeners: Record<string, Listener[]>;
  _emit: (event: string, ...args: unknown[]) => void;
}

interface MockChild {
  pid: number;
  unref: ReturnType<typeof vi.fn>;
  stderr: MockStream;
  on: (event: string, listener: Listener) => MockChild;
  _listeners: Record<string, Listener[]>;
  _emit: (event: string, ...args: unknown[]) => void;
}

function createMockStream(): MockStream {
  const stream: MockStream = {
    _listeners: {},
    on(event: string, listener: Listener) {
      (stream._listeners[event] ??= []).push(listener);
      return stream;
    },
    destroy: vi.fn(),
    _emit(event: string, ...args: unknown[]) {
      for (const l of stream._listeners[event] ?? []) l(...args);
    },
  };
  return stream;
}

function createMockChild(): MockChild {
  const child: MockChild = {
    pid: 9999,
    unref: vi.fn(),
    stderr: createMockStream(),
    _listeners: {},
    on(event: string, listener: Listener) {
      (child._listeners[event] ??= []).push(listener);
      return child;
    },
    _emit(event: string, ...args: unknown[]) {
      for (const l of child._listeners[event] ?? []) l(...args);
    },
  };
  return child;
}

// ---- child_process.spawn mock ------------------------------------------------
const { mockSpawn, mockOpenSync, mockRenameSync, mockExistsSync } = vi.hoisted(() => {
  const mockSpawn = vi.fn();
  const mockOpenSync = vi.fn().mockReturnValue(42); // fake fd
  const mockRenameSync = vi.fn();
  const mockExistsSync = vi.fn().mockReturnValue(false);
  return { mockSpawn, mockOpenSync, mockRenameSync, mockExistsSync };
});

vi.mock('node:child_process', () => ({
  spawn: mockSpawn,
}));

// ---- node:http mock — the readiness probe ---------------------------------------
const { mockHttpGet, httpState } = vi.hoisted(() => {
  const httpState = { ready: false };
  const mockHttpGet = vi.fn((_url: string, onResponse: (res: unknown) => void) => {
    let onError: ((err: Error) => void) | undefined;
    const req = {
      on(event: string, fn: (err: Error) => void) {
        if (event === 'error') onError = fn;
        return req;
      },
      setTimeout: vi.fn(),
      destroy: vi.fn(),
    };
    process.nextTick(() => {
      if (httpState.ready) {
        const res = {
          resume: vi.fn(),
          on(event: string, fn: () => void) {
            if (event === 'end') fn();
            return res;
          },
        };
        onResponse(res);
      } else {
        onError?.(new Error('connect ECONNREFUSED'));
      }
    });
    return req;
  });
  return { mockHttpGet, httpState };
});

vi.mock('node:http', () => ({ default: { get: mockHttpGet }, get: mockHttpGet }));

vi.mock('node:fs', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    openSync: mockOpenSync,
    closeSync: vi.fn(),
    renameSync: mockRenameSync,
    existsSync: mockExistsSync,
  };
});

vi.mock('@/infrastructure/services/filesystem/shep-directory.service.js', () => ({
  getDaemonLogPath: vi.fn().mockReturnValue('/tmp/test-shep/daemon.log'),
}));

// ---- Cross-process start lock mock -------------------------------------------
const { mockAcquireLock, mockReleaseLock } = vi.hoisted(() => {
  const mockReleaseLock = vi.fn();
  const mockAcquireLock = vi.fn();
  return { mockAcquireLock, mockReleaseLock };
});

vi.mock('@/infrastructure/services/daemon/daemon-start-lock.js', () => ({
  acquireDaemonStartLock: mockAcquireLock,
  getDaemonStartLockPath: vi.fn().mockReturnValue('/tmp/test-shep/daemon.start.lock'),
}));

// Global mock child — reassigned per test in beforeEach
let mockChild: MockChild;

// ---- IDaemonService mock + IBrowserOpener mock ----
const { mockDaemonService, mockBrowserOpen } = vi.hoisted(() => {
  const mockDaemonService = {
    read: vi.fn(),
    write: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(undefined),
    isAlive: vi.fn(),
  };
  const mockBrowserOpen = vi.fn();
  return { mockDaemonService, mockBrowserOpen };
});

vi.mock('@/infrastructure/di/container.js', () => ({
  container: {
    resolve: vi.fn().mockImplementation((token: string) => {
      if (token === 'IDaemonService') return mockDaemonService;
      if (token === 'IBrowserOpener') return { open: mockBrowserOpen };
      throw new Error(`Unknown token: ${token}`);
    }),
  },
}));

// ---- Port service mock -------------------------------------------------------
vi.mock('@/infrastructure/services/port.service.js', () => ({
  findAvailablePort: vi.fn().mockResolvedValue(4050),
  DEFAULT_PORT: 4050,
}));

// ---- CLI UI mocks (suppress console output) ----------------------------------
vi.mock('../../../../src/presentation/cli/ui/index.js', () => ({
  colors: {
    success: vi.fn((s: string) => s),
    muted: vi.fn((s: string) => s),
    info: vi.fn((s: string) => s),
    bold: vi.fn((s: string) => s),
  },
  fmt: {
    heading: vi.fn((s: string) => s),
    code: vi.fn((s: string) => s),
  },
  messages: {
    success: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
    newline: vi.fn(),
    warning: vi.fn(),
  },
  spinner: vi.fn((_label: string, fn: () => Promise<unknown>) => fn()),
}));

import { findAvailablePort } from '@/infrastructure/services/port.service.js';
import {
  startDaemon,
  SPAWN_SETTLE_MS,
} from '../../../../src/presentation/cli/commands/daemon/start-daemon.js';
import {
  READY_TIMEOUT_MS,
  READY_POLL_MS,
} from '../../../../src/presentation/cli/commands/daemon/daemon-readiness.js';

describe('startDaemon()', () => {
  const originalEnv = process.env.SHEP_SKIP_READINESS_CHECK;

  beforeEach(() => {
    vi.clearAllMocks();
    // Fresh mock child for each test
    mockChild = createMockChild();
    mockSpawn.mockReturnValue(mockChild);
    mockDaemonService.read.mockResolvedValue(null);
    // Only the freshly spawned child is alive.
    mockDaemonService.isAlive.mockImplementation((pid: number) => pid === mockChild.pid);
    mockAcquireLock.mockResolvedValue({ release: mockReleaseLock });
    mockExistsSync.mockReturnValue(false);
    (findAvailablePort as ReturnType<typeof vi.fn>).mockResolvedValue(4050);

    // Skip readiness check in unit tests (avoids http.get calls)
    process.env.SHEP_SKIP_READINESS_CHECK = '1';
  });

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.SHEP_SKIP_READINESS_CHECK;
    } else {
      process.env.SHEP_SKIP_READINESS_CHECK = originalEnv;
    }
  });

  describe('already-running path (idempotent)', () => {
    it('does NOT spawn a new process when daemon is already alive', async () => {
      mockDaemonService.read.mockResolvedValue({
        pid: 1234,
        port: 4050,
        startedAt: '2026-01-01T00:00:00.000Z',
      });
      mockDaemonService.isAlive.mockReturnValue(true);

      await startDaemon();

      expect(mockSpawn).not.toHaveBeenCalled();
    });

    it('does NOT write daemon.json when daemon is already alive', async () => {
      mockDaemonService.read.mockResolvedValue({
        pid: 1234,
        port: 4050,
        startedAt: '2026-01-01T00:00:00.000Z',
      });
      mockDaemonService.isAlive.mockReturnValue(true);

      await startDaemon();

      expect(mockDaemonService.write).not.toHaveBeenCalled();
    });
  });

  describe('fresh-start path (no existing daemon)', () => {
    it('calls findAvailablePort with DEFAULT_PORT when no port option given', async () => {
      await startDaemon();
      expect(findAvailablePort).toHaveBeenCalledWith(4050);
    });

    it('calls findAvailablePort with the provided port override', async () => {
      (findAvailablePort as ReturnType<typeof vi.fn>).mockResolvedValue(8080);
      await startDaemon({ port: 8080 });
      expect(findAvailablePort).toHaveBeenCalledWith(8080);
    });

    it('spawns the daemon process using process.execPath and _serve args', async () => {
      (findAvailablePort as ReturnType<typeof vi.fn>).mockResolvedValue(4050);
      await startDaemon();
      expect(mockSpawn).toHaveBeenCalledWith(
        process.execPath,
        expect.arrayContaining(['_serve', '--port', '4050']),
        expect.any(Object)
      );
    });

    it('propagates process.execArgv to the child', async () => {
      await startDaemon();
      const spawnArgs = mockSpawn.mock.calls[0][1] as string[];
      for (const arg of process.execArgv) {
        expect(spawnArgs).toContain(arg);
      }
    });

    it('spawns with detached: true', async () => {
      await startDaemon();
      const spawnOpts = mockSpawn.mock.calls[0][2];
      expect(spawnOpts).toMatchObject({ detached: true });
    });

    it('spawns with windowsHide: true to suppress console window on Windows', async () => {
      await startDaemon();
      const spawnOpts = mockSpawn.mock.calls[0][2];
      expect(spawnOpts).toMatchObject({ windowsHide: true });
    });

    it('spawns with stdout and stderr redirected to log file fd', async () => {
      mockOpenSync.mockReturnValue(42);
      await startDaemon();
      const spawnOpts = mockSpawn.mock.calls[0][2];
      expect(spawnOpts).toMatchObject({ stdio: ['ignore', 42, 42] });
    });

    it('opens the log file for appending', async () => {
      await startDaemon();
      expect(mockOpenSync).toHaveBeenCalledWith('/tmp/test-shep/daemon.log', 'a', 0o600);
    });

    it('calls child.unref() after the settle check', async () => {
      await startDaemon();
      expect(mockChild.unref).toHaveBeenCalled();
    });

    it('writes daemon.json with pid, port, and startedAt', async () => {
      (findAvailablePort as ReturnType<typeof vi.fn>).mockResolvedValue(4050);
      await startDaemon();
      expect(mockDaemonService.write).toHaveBeenCalledWith(
        expect.objectContaining({
          pid: 9999,
          port: 4050,
          startedAt: expect.any(String),
        })
      );
    });

    it('writes a valid ISO 8601 timestamp to startedAt', async () => {
      await startDaemon();
      const written = mockDaemonService.write.mock.calls[0][0];
      expect(() => new Date(written.startedAt).toISOString()).not.toThrow();
    });

    it('opens the browser with the correct URL', async () => {
      (findAvailablePort as ReturnType<typeof vi.fn>).mockResolvedValue(4050);
      await startDaemon();
      expect(mockBrowserOpen).toHaveBeenCalledWith('http://localhost:4050/applications');
    });

    it('opens the browser with the custom port URL when --port is given', async () => {
      (findAvailablePort as ReturnType<typeof vi.fn>).mockResolvedValue(7070);
      await startDaemon({ port: 7070 });
      expect(mockBrowserOpen).toHaveBeenCalledWith('http://localhost:7070/applications');
    });
  });

  describe('early crash detection', () => {
    it('does NOT write daemon.json when child exits during settle window', async () => {
      mockSpawn.mockImplementation(() => {
        const child = createMockChild();
        // Emit exit on next tick (before 500ms settle timeout)
        process.nextTick(() => child._emit('exit', 1, null));
        return child;
      });

      await startDaemon();

      expect(mockDaemonService.write).not.toHaveBeenCalled();
    });

    it('cleans up stale daemon.json when child crashes at startup', async () => {
      mockSpawn.mockImplementation(() => {
        const child = createMockChild();
        process.nextTick(() => child._emit('exit', 1, null));
        return child;
      });

      await startDaemon();

      expect(mockDaemonService.delete).toHaveBeenCalled();
    });

    it('does NOT open the browser when child crashes at startup', async () => {
      mockSpawn.mockImplementation(() => {
        const child = createMockChild();
        process.nextTick(() => child._emit('exit', 1, null));
        return child;
      });

      await startDaemon();

      expect(mockBrowserOpen).not.toHaveBeenCalled();
    });
  });

  describe('concurrent starts (cross-process start lock)', () => {
    function order(fn: { mock: { invocationCallOrder: number[] } }): number {
      return fn.mock.invocationCallOrder[0];
    }

    it('reads daemon.json only after acquiring the start lock', async () => {
      await startDaemon();
      expect(mockAcquireLock).toHaveBeenCalledWith(
        '/tmp/test-shep/daemon.start.lock',
        expect.objectContaining({ isAlive: expect.any(Function) })
      );
      expect(order(mockAcquireLock)).toBeLessThan(order(mockDaemonService.read));
    });

    it('holds the lock until daemon.json is written', async () => {
      await startDaemon();
      expect(order(mockDaemonService.write)).toBeLessThan(order(mockReleaseLock));
    });

    it('does not spawn when the lock holder started a daemon while we waited', async () => {
      // The lock is granted only after the other start wrote daemon.json.
      mockAcquireLock.mockImplementation(async () => {
        mockDaemonService.read.mockResolvedValue({
          pid: 1234,
          port: 4050,
          startedAt: '2026-01-01T00:00:00.000Z',
        });
        mockDaemonService.isAlive.mockImplementation((pid: number) => pid === 1234);
        return { release: mockReleaseLock };
      });

      await startDaemon();

      expect(mockSpawn).not.toHaveBeenCalled();
      expect(mockRenameSync).not.toHaveBeenCalled();
      expect(mockDaemonService.write).not.toHaveBeenCalled();
      expect(mockReleaseLock).toHaveBeenCalled();
    });

    it('rotates daemon.log only while holding the lock', async () => {
      mockExistsSync.mockReturnValue(true);
      await startDaemon();
      expect(mockRenameSync).toHaveBeenCalled();
      expect(order(mockAcquireLock)).toBeLessThan(order(mockRenameSync));
      expect(order(mockRenameSync)).toBeLessThan(order(mockReleaseLock));
    });

    it('releases the lock when the child crashes at startup', async () => {
      mockSpawn.mockImplementation(() => {
        const child = createMockChild();
        process.nextTick(() => child._emit('exit', 1, null));
        return child;
      });
      await startDaemon();
      expect(mockReleaseLock).toHaveBeenCalled();
    });

    it('does not record a pid that is no longer alive after the settle window', async () => {
      mockDaemonService.isAlive.mockReturnValue(false);

      await startDaemon();

      expect(mockDaemonService.write).not.toHaveBeenCalled();
      expect(mockDaemonService.delete).toHaveBeenCalled();
      expect(mockBrowserOpen).not.toHaveBeenCalled();
      expect(mockReleaseLock).toHaveBeenCalled();
    });
  });

  describe('readiness gates the daemon.json record', () => {
    beforeEach(() => {
      delete process.env.SHEP_SKIP_READINESS_CHECK;
      httpState.ready = false;
      vi.useFakeTimers();
    });

    afterEach(() => {
      expect(vi.getTimerCount()).toBe(0);
      vi.useRealTimers();
    });

    function order(fn: { mock: { invocationCallOrder: number[] } }): number {
      return fn.mock.invocationCallOrder[0];
    }

    it('does not record a daemon that dies after the settle window but before it is ready', async () => {
      const done = startDaemon();
      await vi.advanceTimersByTimeAsync(SPAWN_SETTLE_MS);
      // Still starting: the port refuses connections for a while…
      await vi.advanceTimersByTimeAsync(READY_POLL_MS * 3);
      // …then the child dies (e.g. EADDRINUSE, a crash while booting).
      mockChild._emit('exit', 1, null);
      await vi.advanceTimersByTimeAsync(READY_POLL_MS);
      await done;

      const recorded = mockDaemonService.write.mock.calls.length > 0;
      const removed = mockDaemonService.delete.mock.calls.length > 0;
      expect(!recorded || removed).toBe(true);
      expect(mockBrowserOpen).not.toHaveBeenCalled();
      expect(mockReleaseLock).toHaveBeenCalled();
    });

    it('writes daemon.json only after the readiness probe succeeds', async () => {
      const done = startDaemon();
      await vi.advanceTimersByTimeAsync(SPAWN_SETTLE_MS);
      await vi.advanceTimersByTimeAsync(READY_POLL_MS * 2);
      expect(mockDaemonService.write).not.toHaveBeenCalled();

      httpState.ready = true;
      await vi.advanceTimersByTimeAsync(READY_POLL_MS);
      await done;

      expect(mockDaemonService.write).toHaveBeenCalledTimes(1);
      const lastProbe = mockHttpGet.mock.invocationCallOrder.at(-1)!;
      expect(lastProbe).toBeLessThan(order(mockDaemonService.write));
      expect(mockBrowserOpen).toHaveBeenCalledWith('http://localhost:4050/applications');
    });

    it('records a daemon that is still alive when readiness times out, and stops probing', async () => {
      const done = startDaemon();
      await vi.advanceTimersByTimeAsync(SPAWN_SETTLE_MS + READY_TIMEOUT_MS + READY_POLL_MS);
      await done;

      expect(mockDaemonService.write).toHaveBeenCalledTimes(1);
      const probes = mockHttpGet.mock.calls.length;
      await vi.advanceTimersByTimeAsync(READY_TIMEOUT_MS);
      expect(mockHttpGet.mock.calls.length).toBe(probes);
    });
  });
});
