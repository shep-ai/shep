// @vitest-environment node

/**
 * Upgrade Command Unit Tests
 *
 * Tests for the `shep upgrade` command.
 *
 * TDD Phase: RED → GREEN → REFACTOR
 */

import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Command } from 'commander';
import { EventEmitter } from 'node:events';
import type { ChildProcess } from 'node:child_process';

// --- Mocks ---

vi.mock('@/infrastructure/di/container.js', () => ({
  container: {
    resolve: vi.fn(),
  },
}));

vi.mock('@cli/presentation/cli/ui/index.js', () => ({
  messages: {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
  },
  colors: {
    accent: (s: string) => s,
    muted: (s: string) => s,
  },
  fmt: {
    heading: (s: string) => s,
    label: (s: string) => s,
    code: (s: string) => s,
    version: (s: string) => `v${s}`,
  },
  symbols: {},
}));

vi.mock('@cli/presentation/cli/commands/daemon/stop-daemon.js', () => ({
  stopDaemon: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@cli/presentation/cli/commands/daemon/start-daemon.js', () => ({
  startDaemon: vi.fn().mockResolvedValue(undefined),
}));

// Import after mocks
import { createUpgradeCommand } from '@cli/presentation/cli/commands/upgrade.command.js';
import { container } from '@/infrastructure/di/container.js';
import { messages } from '@cli/presentation/cli/ui/index.js';
import { stopDaemon } from '@cli/presentation/cli/commands/daemon/stop-daemon.js';
import { startDaemon } from '@cli/presentation/cli/commands/daemon/start-daemon.js';
import type {
  IDaemonService,
  DaemonState,
} from '@/application/ports/output/services/daemon-service.interface.js';

/**
 * Create a mock ChildProcess that emits events on demand.
 * Returns the fake process and a control function to trigger close/error.
 */
function createMockChildProcess() {
  const proc = new EventEmitter() as ChildProcess & EventEmitter;
  // Add a minimal stdout for the version check (piped) case
  (proc as any).stdout = new EventEmitter();
  (proc as any).stderr = new EventEmitter();
  (proc as any).kill = vi.fn();
  return proc;
}

/**
 * Create a mock spawn function that records calls and returns controlled child processes.
 */
function createMockSpawn() {
  const processes: { proc: ReturnType<typeof createMockChildProcess>; args: any[] }[] = [];

  const spawnFn = vi.fn((...args: any[]) => {
    const proc = createMockChildProcess();
    processes.push({ proc, args });
    return proc;
  });

  return { spawnFn, processes };
}

function makeDaemonService(overrides: Partial<IDaemonService> = {}): IDaemonService {
  return {
    read: vi.fn().mockResolvedValue(null),
    write: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(undefined),
    isAlive: vi.fn().mockReturnValue(false),
    ...overrides,
  } as unknown as IDaemonService;
}

const VERSION_SERVICE_MOCK = {
  getVersion: () => ({
    version: '1.20.0',
    name: '@shepai/cli',
    description: 'Autonomous AI Native SDLC Platform',
  }),
};

describe('Upgrade Command', () => {
  const CURRENT_VERSION = '1.20.0';
  let savedExitCode: typeof process.exitCode;

  beforeEach(() => {
    vi.clearAllMocks();
    savedExitCode = process.exitCode;
    process.exitCode = 0;

    // Default: IVersionService returns current version; IDaemonService not running
    const defaultDaemonService = makeDaemonService();
    vi.mocked(container.resolve).mockImplementation((token: unknown) => {
      if (token === 'IDaemonService') return defaultDaemonService;
      return VERSION_SERVICE_MOCK;
    });
  });

  afterEach(() => {
    process.exitCode = savedExitCode;
  });

  describe('command structure', () => {
    it('should return a Commander Command with name "upgrade"', () => {
      const { spawnFn } = createMockSpawn();
      const cmd = createUpgradeCommand(spawnFn as any);
      expect(cmd).toBeInstanceOf(Command);
      expect(cmd.name()).toBe('upgrade');
    });

    it('should have description "Upgrade Shep CLI to the latest version"', () => {
      const { spawnFn } = createMockSpawn();
      const cmd = createUpgradeCommand(spawnFn as any);
      expect(cmd.description()).toBe('Upgrade Shep CLI to the latest version');
    });
  });

  describe('already up to date', () => {
    it('should print already-up-to-date message when latest equals current version', async () => {
      const { spawnFn, processes } = createMockSpawn();
      const cmd = createUpgradeCommand(spawnFn as any);

      const parsePromise = cmd.parseAsync(['node', 'test']);

      // Wait for spawn to be called (npm view)
      await vi.waitFor(() => expect(processes.length).toBe(1));

      // npm view returns same version as current
      const viewProc = processes[0].proc;
      (viewProc as any).stdout.emit('data', Buffer.from(`${CURRENT_VERSION}\n`));
      viewProc.emit('close', 0);

      await parsePromise;

      expect(messages.success).toHaveBeenCalledWith(expect.stringContaining('up to date'));
      expect(messages.success).toHaveBeenCalledWith(expect.stringContaining(CURRENT_VERSION));
    });

    it('should not spawn npm install when already up to date', async () => {
      const { spawnFn, processes } = createMockSpawn();
      const cmd = createUpgradeCommand(spawnFn as any);

      const parsePromise = cmd.parseAsync(['node', 'test']);

      await vi.waitFor(() => expect(processes.length).toBe(1));

      const viewProc = processes[0].proc;
      (viewProc as any).stdout.emit('data', Buffer.from(`${CURRENT_VERSION}\n`));
      viewProc.emit('close', 0);

      await parsePromise;

      // Only one spawn call (npm view), no second call (npm install)
      expect(spawnFn).toHaveBeenCalledTimes(1);
      expect(process.exitCode).toBe(0);
    });
  });

  describe('pre-download', () => {
    it('should spawn npm install in temp dir before global npm install', async () => {
      const { spawnFn, processes } = createMockSpawn();
      const cmd = createUpgradeCommand(spawnFn as any);

      const parsePromise = cmd.parseAsync(['node', 'test']);

      // npm view returns newer version
      await vi.waitFor(() => expect(processes.length).toBe(1));
      (processes[0].proc as any).stdout.emit('data', Buffer.from('2.0.0\n'));
      processes[0].proc.emit('close', 0);

      // pre-download spawned (npm install --prefix <tmpdir> --ignore-scripts)
      await vi.waitFor(() => expect(processes.length).toBe(2));
      expect(spawnFn).toHaveBeenCalledWith(
        'npm',
        expect.arrayContaining(['install', '--ignore-scripts', '@shepai/cli@latest']),
        expect.any(Object)
      );
      processes[1].proc.emit('close', 0);

      // npm install spawned
      await vi.waitFor(() => expect(processes.length).toBe(3));
      processes[2].proc.emit('close', 0);

      await parsePromise;

      expect(messages.info).toHaveBeenCalledWith(expect.stringContaining('Downloading'));
    });

    it('should warn and continue when pre-download fails', async () => {
      const { spawnFn, processes } = createMockSpawn();
      const cmd = createUpgradeCommand(spawnFn as any);

      const parsePromise = cmd.parseAsync(['node', 'test']);

      await vi.waitFor(() => expect(processes.length).toBe(1));
      (processes[0].proc as any).stdout.emit('data', Buffer.from('2.0.0\n'));
      processes[0].proc.emit('close', 0);

      // pre-download fails
      await vi.waitFor(() => expect(processes.length).toBe(2));
      processes[1].proc.emit('close', 1);

      // npm install should still be spawned
      await vi.waitFor(() => expect(processes.length).toBe(3));
      processes[2].proc.emit('close', 0);

      await parsePromise;

      expect(messages.warning).toHaveBeenCalledWith(expect.stringContaining('did not complete'));
      expect(messages.success).toHaveBeenCalledWith(
        expect.stringContaining('upgraded successfully')
      );
    });

    it('should warn and continue when pre-download spawn errors', async () => {
      const { spawnFn, processes } = createMockSpawn();
      const cmd = createUpgradeCommand(spawnFn as any);

      const parsePromise = cmd.parseAsync(['node', 'test']);

      await vi.waitFor(() => expect(processes.length).toBe(1));
      (processes[0].proc as any).stdout.emit('data', Buffer.from('2.0.0\n'));
      processes[0].proc.emit('close', 0);

      // pre-download spawn errors
      await vi.waitFor(() => expect(processes.length).toBe(2));
      processes[1].proc.emit('error', new Error('spawn npm ENOENT'));

      // npm install should still be spawned
      await vi.waitFor(() => expect(processes.length).toBe(3));
      processes[2].proc.emit('close', 0);

      await parsePromise;

      expect(messages.warning).toHaveBeenCalledWith(expect.stringContaining('did not complete'));
      expect(messages.success).toHaveBeenCalled();
    });
  });

  describe('successful upgrade', () => {
    /** Helper: complete the version check + pre-download steps, return when install is ready */
    async function completePreSteps(processes: ReturnType<typeof createMockSpawn>['processes']) {
      // npm view
      await vi.waitFor(() => expect(processes.length).toBe(1));
      (processes[0].proc as any).stdout.emit('data', Buffer.from('2.0.0\n'));
      processes[0].proc.emit('close', 0);

      // pre-download
      await vi.waitFor(() => expect(processes.length).toBe(2));
      processes[1].proc.emit('close', 0);
    }

    it('should print upgrade info when newer version is available', async () => {
      const { spawnFn, processes } = createMockSpawn();
      const cmd = createUpgradeCommand(spawnFn as any);

      const parsePromise = cmd.parseAsync(['node', 'test']);

      await completePreSteps(processes);

      // npm install spawned
      await vi.waitFor(() => expect(processes.length).toBe(3));
      processes[2].proc.emit('close', 0);

      await parsePromise;

      expect(messages.info).toHaveBeenCalledWith(expect.stringContaining(CURRENT_VERSION));
      expect(messages.info).toHaveBeenCalledWith(expect.stringContaining('2.0.0'));
    });

    it('should spawn npm install with stdio inherit when upgrade available', async () => {
      const { spawnFn, processes } = createMockSpawn();
      const cmd = createUpgradeCommand(spawnFn as any);

      const parsePromise = cmd.parseAsync(['node', 'test']);

      await completePreSteps(processes);

      await vi.waitFor(() => expect(processes.length).toBe(3));
      processes[2].proc.emit('close', 0);

      await parsePromise;

      // Check that npm install was called with inherit
      expect(spawnFn).toHaveBeenCalledWith(
        'npm',
        ['i', '-g', '@shepai/cli@latest', '--prefer-offline'],
        expect.objectContaining({ stdio: 'inherit' })
      );
    });

    it('should print success message on exit code 0', async () => {
      const { spawnFn, processes } = createMockSpawn();
      const cmd = createUpgradeCommand(spawnFn as any);

      const parsePromise = cmd.parseAsync(['node', 'test']);

      await completePreSteps(processes);

      await vi.waitFor(() => expect(processes.length).toBe(3));
      processes[2].proc.emit('close', 0);

      await parsePromise;

      expect(messages.success).toHaveBeenCalledWith(
        expect.stringContaining('upgraded successfully')
      );
      expect(process.exitCode).toBe(0);
    });
  });

  describe('error handling', () => {
    it('should print error and set exitCode=1 on npm install non-zero exit', async () => {
      const { spawnFn, processes } = createMockSpawn();
      const cmd = createUpgradeCommand(spawnFn as any);

      const parsePromise = cmd.parseAsync(['node', 'test']);

      await vi.waitFor(() => expect(processes.length).toBe(1));
      (processes[0].proc as any).stdout.emit('data', Buffer.from('2.0.0\n'));
      processes[0].proc.emit('close', 0);

      // pre-download
      await vi.waitFor(() => expect(processes.length).toBe(2));
      processes[1].proc.emit('close', 0);

      // npm install fails
      await vi.waitFor(() => expect(processes.length).toBe(3));
      processes[2].proc.emit('close', 1);

      await parsePromise;

      expect(messages.error).toHaveBeenCalledWith(expect.stringContaining('failed'));
      expect(process.exitCode).toBe(1);
    });

    it('should warn and proceed with upgrade when version check fails', async () => {
      const { spawnFn, processes } = createMockSpawn();
      const cmd = createUpgradeCommand(spawnFn as any);

      const parsePromise = cmd.parseAsync(['node', 'test']);

      // npm view fails with error event
      await vi.waitFor(() => expect(processes.length).toBe(1));
      processes[0].proc.emit('error', new Error('spawn npm ENOENT'));

      // pre-download
      await vi.waitFor(() => expect(processes.length).toBe(2));
      processes[1].proc.emit('close', 0);

      // Should still spawn npm install
      await vi.waitFor(() => expect(processes.length).toBe(3));
      processes[2].proc.emit('close', 0);

      await parsePromise;

      expect(messages.warning).toHaveBeenCalledWith(expect.stringContaining('version check'));
      expect(messages.info).toHaveBeenCalledWith(expect.stringContaining('latest'));
      expect(messages.success).toHaveBeenCalled();
    });

    it('should print error and set exitCode=1 when npm install spawn errors', async () => {
      const { spawnFn, processes } = createMockSpawn();
      const cmd = createUpgradeCommand(spawnFn as any);

      const parsePromise = cmd.parseAsync(['node', 'test']);

      // npm view succeeds with newer version
      await vi.waitFor(() => expect(processes.length).toBe(1));
      (processes[0].proc as any).stdout.emit('data', Buffer.from('2.0.0\n'));
      processes[0].proc.emit('close', 0);

      // pre-download
      await vi.waitFor(() => expect(processes.length).toBe(2));
      processes[1].proc.emit('close', 0);

      // npm install spawn errors
      await vi.waitFor(() => expect(processes.length).toBe(3));
      processes[2].proc.emit('error', new Error('spawn npm ENOENT'));

      await parsePromise;

      expect(messages.error).toHaveBeenCalled();
      expect(process.exitCode).toBe(1);
    });

    it('should proceed with upgrade when version check times out', async () => {
      vi.useFakeTimers();
      const { spawnFn, processes } = createMockSpawn();
      const cmd = createUpgradeCommand(spawnFn as any);

      const parsePromise = cmd.parseAsync(['node', 'test']);

      await vi.waitFor(() => expect(processes.length).toBe(1));

      // Advance past the 10-second timeout
      vi.advanceTimersByTime(11_000);

      // pre-download
      await vi.waitFor(() => expect(processes.length).toBe(2));
      processes[1].proc.emit('close', 0);

      // Should spawn npm install after timeout + cache
      await vi.waitFor(() => expect(processes.length).toBe(3));
      processes[2].proc.emit('close', 0);

      await parsePromise;

      expect(messages.warning).toHaveBeenCalledWith(expect.stringContaining('version check'));
      expect(messages.success).toHaveBeenCalled();

      vi.useRealTimers();
    });
  });

  // ── Daemon lifecycle — daemon WAS running ──────────────────────────────────

  describe('daemon lifecycle — daemon WAS running', () => {
    const DAEMON_STATE: DaemonState = {
      pid: 42,
      port: 4050,
      startedAt: '2024-01-01T00:00:00Z',
    };

    /** Set up container to return a running daemon service alongside the version service. */
    function setupRunningDaemon(): IDaemonService {
      const daemonService = makeDaemonService({
        read: vi.fn().mockResolvedValue(DAEMON_STATE),
        isAlive: vi.fn().mockReturnValue(true),
      });
      vi.mocked(container.resolve).mockImplementation((token: unknown) => {
        if (token === 'IDaemonService') return daemonService;
        return VERSION_SERVICE_MOCK;
      });
      return daemonService;
    }

    /** Run the full upgrade flow: npm view → pre-download → npm install. */
    async function runUpgradeFlow(
      spawnFn: ReturnType<typeof createMockSpawn>['spawnFn'],
      processes: ReturnType<typeof createMockSpawn>['processes'],
      installExitCode: number,
      parsePromise: Promise<unknown>
    ) {
      // npm view returns a newer version
      await vi.waitFor(() => expect(processes.length).toBe(1));
      const viewProc = processes[0].proc;
      (viewProc as any).stdout.emit('data', Buffer.from('2.0.0\n'));
      viewProc.emit('close', 0);

      // pre-download
      await vi.waitFor(() => expect(processes.length).toBe(2));
      processes[1].proc.emit('close', 0);

      // npm install spawned
      await vi.waitFor(() => expect(processes.length).toBe(3));
      processes[2].proc.emit('close', installExitCode);

      await parsePromise;
    }

    it('should call stopDaemon() when daemon is running before npm install', async () => {
      setupRunningDaemon();
      const { spawnFn, processes } = createMockSpawn();
      const cmd = createUpgradeCommand(spawnFn as any);

      const parsePromise = cmd.parseAsync(['node', 'test']);
      await runUpgradeFlow(spawnFn, processes, 0, parsePromise);

      expect(stopDaemon).toHaveBeenCalledTimes(1);
    });

    it('should print "Stopping daemon before upgrade..." before stopping', async () => {
      setupRunningDaemon();
      const { spawnFn, processes } = createMockSpawn();
      const cmd = createUpgradeCommand(spawnFn as any);

      const parsePromise = cmd.parseAsync(['node', 'test']);
      await runUpgradeFlow(spawnFn, processes, 0, parsePromise);

      expect(messages.info).toHaveBeenCalledWith(
        expect.stringMatching(/stopping daemon before upgrade/i)
      );
    });

    it('should call startDaemon() with previousPort after successful npm install', async () => {
      setupRunningDaemon();
      const { spawnFn, processes } = createMockSpawn();
      const cmd = createUpgradeCommand(spawnFn as any);

      const parsePromise = cmd.parseAsync(['node', 'test']);
      await runUpgradeFlow(spawnFn, processes, 0, parsePromise);

      expect(startDaemon).toHaveBeenCalledWith(
        expect.objectContaining({ port: DAEMON_STATE.port })
      );
    });

    it('should print "Restarting daemon..." before restart', async () => {
      setupRunningDaemon();
      const { spawnFn, processes } = createMockSpawn();
      const cmd = createUpgradeCommand(spawnFn as any);

      const parsePromise = cmd.parseAsync(['node', 'test']);
      await runUpgradeFlow(spawnFn, processes, 0, parsePromise);

      expect(messages.info).toHaveBeenCalledWith(expect.stringMatching(/restarting daemon/i));
    });

    it('should print "Daemon restarted successfully." after restart', async () => {
      setupRunningDaemon();
      const { spawnFn, processes } = createMockSpawn();
      const cmd = createUpgradeCommand(spawnFn as any);

      const parsePromise = cmd.parseAsync(['node', 'test']);
      await runUpgradeFlow(spawnFn, processes, 0, parsePromise);

      expect(messages.success).toHaveBeenCalledWith(
        expect.stringMatching(/daemon restarted successfully/i)
      );
    });

    it('should call stopDaemon() AFTER pre-download but BEFORE npm install (order check)', async () => {
      setupRunningDaemon();
      const { spawnFn, processes } = createMockSpawn();
      const cmd = createUpgradeCommand(spawnFn as any);

      const callOrder: string[] = [];
      vi.mocked(stopDaemon).mockImplementation(async () => {
        callOrder.push('stopDaemon');
      });

      const parsePromise = cmd.parseAsync(['node', 'test']);

      // npm view
      await vi.waitFor(() => expect(processes.length).toBe(1));
      (processes[0].proc as any).stdout.emit('data', Buffer.from('2.0.0\n'));
      processes[0].proc.emit('close', 0);

      // pre-download — stopDaemon should NOT have been called yet
      await vi.waitFor(() => expect(processes.length).toBe(2));
      expect(callOrder).not.toContain('stopDaemon');
      processes[1].proc.emit('close', 0);

      // After pre-download, stopDaemon fires before npm install
      await vi.waitFor(() => expect(processes.length).toBe(3));
      // At this point stopDaemon must have already been called (before npm install spawn)
      expect(callOrder).toContain('stopDaemon');
      processes[2].proc.emit('close', 0);

      await parsePromise;
    });

    it('should still call startDaemon() when npm install fails (non-zero)', async () => {
      setupRunningDaemon();
      const { spawnFn, processes } = createMockSpawn();
      const cmd = createUpgradeCommand(spawnFn as any);

      const parsePromise = cmd.parseAsync(['node', 'test']);
      await runUpgradeFlow(spawnFn, processes, 1, parsePromise);

      expect(startDaemon).toHaveBeenCalledWith(
        expect.objectContaining({ port: DAEMON_STATE.port })
      );
    });

    it('should print NFR-6(d) message when npm install fails', async () => {
      setupRunningDaemon();
      const { spawnFn, processes } = createMockSpawn();
      const cmd = createUpgradeCommand(spawnFn as any);

      const parsePromise = cmd.parseAsync(['node', 'test']);
      await runUpgradeFlow(spawnFn, processes, 1, parsePromise);

      expect(messages.error).toHaveBeenCalledWith(
        expect.stringMatching(/upgrade failed.*daemon restored on previous version/i)
      );
    });

    it('should set exitCode=1 when npm install fails even with daemon restart', async () => {
      setupRunningDaemon();
      const { spawnFn, processes } = createMockSpawn();
      const cmd = createUpgradeCommand(spawnFn as any);

      const parsePromise = cmd.parseAsync(['node', 'test']);
      await runUpgradeFlow(spawnFn, processes, 1, parsePromise);

      expect(process.exitCode).toBe(1);
    });
  });

  // ── Daemon lifecycle — daemon was NOT running ──────────────────────────────

  describe('daemon lifecycle — daemon was NOT running', () => {
    /** Complete version check + pre-download + npm install with given exit code */
    async function runFullFlow(
      processes: ReturnType<typeof createMockSpawn>['processes'],
      installExitCode = 0
    ) {
      await vi.waitFor(() => expect(processes.length).toBe(1));
      (processes[0].proc as any).stdout.emit('data', Buffer.from('2.0.0\n'));
      processes[0].proc.emit('close', 0);

      // pre-download
      await vi.waitFor(() => expect(processes.length).toBe(2));
      processes[1].proc.emit('close', 0);

      // npm install
      await vi.waitFor(() => expect(processes.length).toBe(3));
      processes[2].proc.emit('close', installExitCode);
    }

    it('should NOT call stopDaemon() when daemon is not running', async () => {
      // beforeEach already sets up not-running daemon service (default)
      const { spawnFn, processes } = createMockSpawn();
      const cmd = createUpgradeCommand(spawnFn as any);

      const parsePromise = cmd.parseAsync(['node', 'test']);
      await runFullFlow(processes);
      await parsePromise;

      expect(stopDaemon).not.toHaveBeenCalled();
    });

    it('should call startDaemon() after a successful upgrade when daemon was not running', async () => {
      const { spawnFn, processes } = createMockSpawn();
      const cmd = createUpgradeCommand(spawnFn as any);

      const parsePromise = cmd.parseAsync(['node', 'test']);
      await runFullFlow(processes);
      await parsePromise;

      expect(startDaemon).toHaveBeenCalledTimes(1);
    });

    it('should NOT call startDaemon() when upgrade fails and daemon was not running', async () => {
      const { spawnFn, processes } = createMockSpawn();
      const cmd = createUpgradeCommand(spawnFn as any);

      const parsePromise = cmd.parseAsync(['node', 'test']);
      await runFullFlow(processes, 1);
      await parsePromise;

      expect(startDaemon).not.toHaveBeenCalled();
    });

    it('should complete upgrade normally (success message) when daemon was not running', async () => {
      const { spawnFn, processes } = createMockSpawn();
      const cmd = createUpgradeCommand(spawnFn as any);

      const parsePromise = cmd.parseAsync(['node', 'test']);
      await runFullFlow(processes);
      await parsePromise;

      expect(messages.success).toHaveBeenCalledWith(
        expect.stringContaining('upgraded successfully')
      );
    });
  });
});
