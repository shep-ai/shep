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
const { mockSpawn, mockOpenSync } = vi.hoisted(() => {
  const mockSpawn = vi.fn();
  const mockOpenSync = vi.fn().mockReturnValue(42); // fake fd
  return { mockSpawn, mockOpenSync };
});

vi.mock('node:child_process', () => ({
  spawn: mockSpawn,
}));

vi.mock('node:fs', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    openSync: mockOpenSync,
    closeSync: vi.fn(),
    renameSync: vi.fn(),
    existsSync: vi.fn().mockReturnValue(false),
  };
});

vi.mock('@/infrastructure/services/filesystem/shep-directory.service.js', () => ({
  getDaemonLogPath: vi.fn().mockReturnValue('/tmp/test-shep/daemon.log'),
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
vi.mock('src/presentation/cli/ui/index.js', () => ({
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
import { startDaemon } from '../../../../src/presentation/cli/commands/daemon/start-daemon.js';

describe('startDaemon()', () => {
  const originalEnv = process.env.SHEP_SKIP_READINESS_CHECK;

  beforeEach(() => {
    vi.clearAllMocks();
    // Fresh mock child for each test
    mockChild = createMockChild();
    mockSpawn.mockReturnValue(mockChild);
    mockDaemonService.read.mockResolvedValue(null);
    mockDaemonService.isAlive.mockReturnValue(false);
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
      expect(mockBrowserOpen).toHaveBeenCalledWith('http://localhost:4050');
    });

    it('opens the browser with the custom port URL when --port is given', async () => {
      (findAvailablePort as ReturnType<typeof vi.fn>).mockResolvedValue(7070);
      await startDaemon({ port: 7070 });
      expect(mockBrowserOpen).toHaveBeenCalledWith('http://localhost:7070');
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
});
