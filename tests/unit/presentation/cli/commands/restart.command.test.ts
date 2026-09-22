// @vitest-environment node

/**
 * Restart Command Unit Tests
 *
 * Tests for the `shep restart` command.
 *
 * TDD Phase: RED → GREEN → REFACTOR
 */

import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Command } from 'commander';

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
    newline: vi.fn(),
  },
  fmt: {
    heading: (s: string) => s,
    code: (s: string) => s,
  },
}));

vi.mock('@cli/presentation/cli/commands/daemon/start-daemon.js', () => ({
  startDaemon: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@cli/presentation/cli/commands/daemon/stop-daemon.js', () => ({
  stopDaemon: vi.fn().mockResolvedValue(undefined),
}));

// Import after mocks
import { createRestartCommand } from '@cli/presentation/cli/commands/restart.command.js';
import { container } from '@/infrastructure/di/container.js';
import { messages } from '@cli/presentation/cli/ui/index.js';
import { startDaemon } from '@cli/presentation/cli/commands/daemon/start-daemon.js';
import { stopDaemon } from '@cli/presentation/cli/commands/daemon/stop-daemon.js';
import type {
  IDaemonService,
  DaemonState,
} from '@/application/ports/output/services/daemon-service.interface.js';

function makeDaemonService(overrides: Partial<IDaemonService> = {}): IDaemonService {
  return {
    read: vi.fn().mockResolvedValue(null),
    write: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(undefined),
    isAlive: vi.fn().mockReturnValue(false),
    ...overrides,
  } as unknown as IDaemonService;
}

const RUNNING_STATE: DaemonState = { pid: 12345, port: 4050, startedAt: '2024-01-01T00:00:00Z' };

describe('Restart Command', () => {
  let savedExitCode: typeof process.exitCode;

  beforeEach(() => {
    vi.clearAllMocks();
    savedExitCode = process.exitCode;
    process.exitCode = 0;
  });

  afterEach(() => {
    process.exitCode = savedExitCode;
  });

  describe('command structure', () => {
    it('should return a Commander Command with name "restart"', () => {
      const cmd = createRestartCommand();
      expect(cmd).toBeInstanceOf(Command);
      expect(cmd.name()).toBe('restart');
    });

    it('should have a description', () => {
      const cmd = createRestartCommand();
      expect(cmd.description()).toBeTruthy();
    });

    it('should accept a --port option', () => {
      const cmd = createRestartCommand();
      const portOpt = cmd.options.find((o) => o.long === '--port');
      expect(portOpt).toBeDefined();
    });
  });

  describe('daemon IS running', () => {
    it('should call stopDaemon() before startDaemon() when daemon is alive', async () => {
      const daemonService = makeDaemonService({
        read: vi.fn().mockResolvedValue(RUNNING_STATE),
        isAlive: vi.fn().mockReturnValue(true),
      });
      vi.mocked(container.resolve).mockReturnValue(daemonService);

      const cmd = createRestartCommand();
      await cmd.parseAsync(['node', 'test']);

      expect(stopDaemon).toHaveBeenCalledWith(daemonService);
      expect(startDaemon).toHaveBeenCalled();

      // Verify order: stopDaemon before startDaemon
      const stopOrder = vi.mocked(stopDaemon).mock.invocationCallOrder[0];
      const startOrder = vi.mocked(startDaemon).mock.invocationCallOrder[0];
      expect(stopOrder).toBeLessThan(startOrder);
    });

    it('should call startDaemon() with the daemon port when no --port flag given', async () => {
      const daemonService = makeDaemonService({
        read: vi.fn().mockResolvedValue(RUNNING_STATE),
        isAlive: vi.fn().mockReturnValue(true),
      });
      vi.mocked(container.resolve).mockReturnValue(daemonService);

      const cmd = createRestartCommand();
      await cmd.parseAsync(['node', 'test']);

      expect(startDaemon).toHaveBeenCalledWith(
        expect.objectContaining({ port: RUNNING_STATE.port })
      );
    });
  });

  describe('daemon is NOT running', () => {
    it('should NOT call stopDaemon() when daemon is not running', async () => {
      const daemonService = makeDaemonService({
        read: vi.fn().mockResolvedValue(null),
        isAlive: vi.fn().mockReturnValue(false),
      });
      vi.mocked(container.resolve).mockReturnValue(daemonService);

      const cmd = createRestartCommand();
      await cmd.parseAsync(['node', 'test']);

      expect(stopDaemon).not.toHaveBeenCalled();
    });

    it('should call startDaemon() when daemon is not running', async () => {
      const daemonService = makeDaemonService({
        read: vi.fn().mockResolvedValue(null),
        isAlive: vi.fn().mockReturnValue(false),
      });
      vi.mocked(container.resolve).mockReturnValue(daemonService);

      const cmd = createRestartCommand();
      await cmd.parseAsync(['node', 'test']);

      expect(startDaemon).toHaveBeenCalled();
    });

    it('should print "Daemon was not running" message when daemon is not running', async () => {
      const daemonService = makeDaemonService({
        read: vi.fn().mockResolvedValue(null),
        isAlive: vi.fn().mockReturnValue(false),
      });
      vi.mocked(container.resolve).mockReturnValue(daemonService);

      const cmd = createRestartCommand();
      await cmd.parseAsync(['node', 'test']);

      expect(messages.info).toHaveBeenCalledWith(expect.stringMatching(/daemon was not running/i));
    });

    it('should also handle the case where state exists but daemon is not alive', async () => {
      const daemonService = makeDaemonService({
        read: vi.fn().mockResolvedValue(RUNNING_STATE),
        isAlive: vi.fn().mockReturnValue(false),
      });
      vi.mocked(container.resolve).mockReturnValue(daemonService);

      const cmd = createRestartCommand();
      await cmd.parseAsync(['node', 'test']);

      expect(stopDaemon).not.toHaveBeenCalled();
      expect(startDaemon).toHaveBeenCalled();
    });
  });

  describe('--port flag', () => {
    it('should forward --port 4000 to startDaemon({ port: 4000 }) when daemon is running', async () => {
      const daemonService = makeDaemonService({
        read: vi.fn().mockResolvedValue(RUNNING_STATE),
        isAlive: vi.fn().mockReturnValue(true),
      });
      vi.mocked(container.resolve).mockReturnValue(daemonService);

      const cmd = createRestartCommand();
      await cmd.parseAsync(['node', 'test', '--port', '4000']);

      expect(startDaemon).toHaveBeenCalledWith(expect.objectContaining({ port: 4000 }));
    });

    it('should forward --port 4000 to startDaemon({ port: 4000 }) when daemon is not running', async () => {
      const daemonService = makeDaemonService({
        read: vi.fn().mockResolvedValue(null),
        isAlive: vi.fn().mockReturnValue(false),
      });
      vi.mocked(container.resolve).mockReturnValue(daemonService);

      const cmd = createRestartCommand();
      await cmd.parseAsync(['node', 'test', '--port', '4000']);

      expect(startDaemon).toHaveBeenCalledWith(expect.objectContaining({ port: 4000 }));
    });

    it('should reject --port below 1024 with InvalidArgumentError', async () => {
      const daemonService = makeDaemonService();
      vi.mocked(container.resolve).mockReturnValue(daemonService);

      const cmd = createRestartCommand();
      await expect(cmd.parseAsync(['node', 'test', '--port', '80'])).rejects.toThrow();
    });

    it('should reject --port above 65535 with InvalidArgumentError', async () => {
      const daemonService = makeDaemonService();
      vi.mocked(container.resolve).mockReturnValue(daemonService);

      const cmd = createRestartCommand();
      await expect(cmd.parseAsync(['node', 'test', '--port', '99999'])).rejects.toThrow();
    });

    it('should reject non-numeric --port with InvalidArgumentError', async () => {
      const daemonService = makeDaemonService();
      vi.mocked(container.resolve).mockReturnValue(daemonService);

      const cmd = createRestartCommand();
      await expect(cmd.parseAsync(['node', 'test', '--port', 'abc'])).rejects.toThrow();
    });
  });

  describe('inside a Shep agent run', () => {
    const saved = process.env.SHEP_AGENT_RUN_ID;

    beforeEach(() => {
      process.env.SHEP_AGENT_RUN_ID = 'run-inside';
      vi.mocked(container.resolve).mockReturnValue(
        makeDaemonService({
          read: vi.fn().mockResolvedValue(RUNNING_STATE),
          isAlive: vi.fn().mockReturnValue(true),
        })
      );
    });

    afterEach(() => {
      if (saved === undefined) delete process.env.SHEP_AGENT_RUN_ID;
      else process.env.SHEP_AGENT_RUN_ID = saved;
    });

    it('refuses to restart the daemon without --force', async () => {
      await createRestartCommand().parseAsync(['node', 'test']);

      expect(stopDaemon).not.toHaveBeenCalled();
      expect(startDaemon).not.toHaveBeenCalled();
      expect(process.exitCode).toBe(1);
    });

    it('restarts with --force', async () => {
      await createRestartCommand().parseAsync(['node', 'test', '--force']);

      expect(stopDaemon).toHaveBeenCalled();
    });
  });
});
