/**
 * _serve Command Unit Tests
 *
 * Tests for the hidden `shep _serve` daemon entry point command.
 *
 * TDD Phase: RED
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Command } from 'commander';

// Mock DI container
// Note: container.resolve() is called with string tokens to obtain services.
vi.mock('@/infrastructure/di/container.js', () => ({
  container: {
    resolve: vi.fn().mockImplementation((token: unknown) => {
      // Class-token resolution (container.resolve(SomeClass))
      if (typeof token === 'function') {
        return { execute: vi.fn().mockResolvedValue({}) };
      }
      if (token === 'IVersionService') {
        return {
          getVersion: vi.fn().mockReturnValue({
            version: '1.0.0',
            name: '@shepai/cli',
            description: 'Test description',
          }),
        };
      }
      if (token === 'IWebServerService') {
        return mockWebServerService;
      }
      if (token === 'IDeploymentService') {
        return mockDeploymentService;
      }
      if (token === 'WhatsAppConnectionService') {
        return {
          start: vi.fn().mockResolvedValue(undefined),
          stop: vi.fn().mockResolvedValue(undefined),
        };
      }
      if (
        token === 'IAgentRunRepository' ||
        token === 'IPhaseTimingRepository' ||
        token === 'IFeatureRepository' ||
        token === 'INotificationService' ||
        token === 'IRepositoryRepository' ||
        token === 'IGitHubRepositoryService' ||
        token === 'IDesktopNotifier'
      ) {
        return {};
      }
      throw new Error(`Unknown token: ${String(token)}`);
    }),
  },
}));

// Mock version env vars helper
vi.mock('@/infrastructure/services/version.service.js', () => ({
  setVersionEnvVars: vi.fn(),
}));

// Mock resolveWebDir
vi.mock('@/infrastructure/services/web-server.service.js', () => ({
  resolveWebDir: vi.fn().mockReturnValue({ dir: '/mock/web/dir', dev: false }),
}));

// Mock notification watcher
vi.mock('@/infrastructure/services/notifications/notification-watcher.service.js', () => ({
  initializeNotificationWatcher: vi.fn(),
  getNotificationWatcher: vi.fn().mockReturnValue({
    start: vi.fn(),
    stop: vi.fn(),
  }),
}));

// Mock auto-archive watcher
vi.mock('@/infrastructure/services/auto-archive/auto-archive-watcher.service.js', () => ({
  initializeAutoArchiveWatcher: vi.fn(),
  getAutoArchiveWatcher: vi.fn().mockReturnValue({
    start: vi.fn(),
    stop: vi.fn(),
  }),
}));

// Mock contributor pipeline watchers (spec 097, FR-42)
vi.mock('@/infrastructure/services/contributors/stale-good-first-issue-watcher.service.js', () => ({
  initializeStaleGoodFirstIssueWatcher: vi.fn(),
  getStaleGoodFirstIssueWatcher: vi.fn().mockReturnValue({
    start: vi.fn(),
    stop: vi.fn(),
  }),
}));
vi.mock('@/infrastructure/services/contributors/monthly-recap-watcher.service.js', () => ({
  initializeMonthlyRecapWatcher: vi.fn(),
  getMonthlyRecapWatcher: vi.fn().mockReturnValue({
    start: vi.fn(),
    stop: vi.fn(),
  }),
}));

// Mock contributor pipeline use cases (resolved via class tokens)
vi.mock('@/application/use-cases/contributors/detect-stale-good-first-issue.use-case.js', () => ({
  DetectStaleGoodFirstIssueUseCase: vi.fn(),
}));
vi.mock('@/application/use-cases/contributors/generate-monthly-recap.use-case.js', () => ({
  GenerateMonthlyRecapUseCase: vi.fn(),
}));
vi.mock('@/application/use-cases/contributors/publish-monthly-recap.use-case.js', () => ({
  PublishMonthlyRecapUseCase: vi.fn(),
}));

const mockWebServerService = {
  start: vi.fn().mockResolvedValue(undefined),
  stop: vi.fn().mockResolvedValue(undefined),
};

const mockDeploymentService = {
  stopAll: vi.fn(),
};

import { getNotificationWatcher } from '@/infrastructure/services/notifications/notification-watcher.service.js';
import { createServeCommand } from '../../../src/presentation/cli/commands/_serve.command.js';

describe('_serve command', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockWebServerService.start.mockClear();
    mockWebServerService.stop.mockClear();
    process.exitCode = undefined;
  });

  describe('command structure', () => {
    it('returns a Commander Command instance', () => {
      const cmd = createServeCommand();
      expect(cmd).toBeInstanceOf(Command);
    });

    it('has name "_serve"', () => {
      const cmd = createServeCommand();
      expect(cmd.name()).toBe('_serve');
    });

    it('is hidden from --help output', () => {
      const cmd = createServeCommand();
      // Commander 14 uses _hidden internal property (no public isHidden() method)
      expect((cmd as unknown as { _hidden: boolean })._hidden).toBe(true);
    });

    it('has a --port option', () => {
      const cmd = createServeCommand();
      const portOption = cmd.options.find((o) => o.long === '--port');
      expect(portOption).toBeDefined();
    });
  });

  describe('command execution', () => {
    it('calls WebServerService.start with the provided port', async () => {
      const cmd = createServeCommand();
      await cmd.parseAsync(['--port', '4050'], { from: 'user' });
      expect(mockWebServerService.start).toHaveBeenCalledWith(
        4050,
        '/mock/web/dir',
        expect.any(Boolean)
      );
    });

    it('passes port 4099 when --port 4099 is provided', async () => {
      const cmd = createServeCommand();
      await cmd.parseAsync(['--port', '4099'], { from: 'user' });
      expect(mockWebServerService.start).toHaveBeenCalledWith(
        4099,
        '/mock/web/dir',
        expect.any(Boolean)
      );
    });

    it('starts the notification watcher after server start', async () => {
      const cmd = createServeCommand();
      await cmd.parseAsync(['--port', '4050'], { from: 'user' });
      const watcher = getNotificationWatcher();
      expect(watcher.start).toHaveBeenCalled();
    });
  });

  describe('SIGTERM graceful shutdown', () => {
    it('registers a SIGTERM handler', async () => {
      const processSpy = vi.spyOn(process, 'on');
      const cmd = createServeCommand();
      await cmd.parseAsync(['--port', '4050'], { from: 'user' });
      const sigtermCall = processSpy.mock.calls.find(([event]) => event === 'SIGTERM');
      expect(sigtermCall).toBeDefined();
      processSpy.mockRestore();
    });

    it('calls service.stop() when SIGTERM is received', async () => {
      const handlers: Record<string, () => Promise<void>> = {};
      const processSpy = vi
        .spyOn(process, 'on')
        .mockImplementation((event: string | symbol, listener: (...args: unknown[]) => void) => {
          handlers[String(event)] = listener as () => Promise<void>;
          return process;
        });

      const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);

      const cmd = createServeCommand();
      await cmd.parseAsync(['--port', '4050'], { from: 'user' });

      await handlers['SIGTERM']?.();

      expect(mockWebServerService.stop).toHaveBeenCalled();
      processSpy.mockRestore();
      exitSpy.mockRestore();
    });

    it('calls process.exit(0) after graceful shutdown', async () => {
      const handlers: Record<string, () => Promise<void>> = {};
      vi.spyOn(process, 'on').mockImplementation(
        (event: string | symbol, listener: (...args: unknown[]) => void) => {
          handlers[String(event)] = listener as () => Promise<void>;
          return process;
        }
      );

      const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);

      const cmd = createServeCommand();
      await cmd.parseAsync(['--port', '4050'], { from: 'user' });

      await handlers['SIGTERM']?.();

      expect(exitSpy).toHaveBeenCalledWith(0);
      exitSpy.mockRestore();
      vi.restoreAllMocks();
    });

    it('isShuttingDown flag prevents double-shutdown (service.stop called once)', async () => {
      const handlers: Record<string, () => Promise<void>> = {};
      vi.spyOn(process, 'on').mockImplementation(
        (event: string | symbol, listener: (...args: unknown[]) => void) => {
          handlers[String(event)] = listener as () => Promise<void>;
          return process;
        }
      );

      const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);

      const cmd = createServeCommand();
      await cmd.parseAsync(['--port', '4050'], { from: 'user' });

      // Call shutdown twice concurrently
      await Promise.all([handlers['SIGTERM']?.(), handlers['SIGTERM']?.()]);

      expect(mockWebServerService.stop).toHaveBeenCalledTimes(1);
      exitSpy.mockRestore();
      vi.restoreAllMocks();
    });
  });

  describe('SIGINT graceful shutdown', () => {
    it('registers a SIGINT handler with the same shutdown behavior', async () => {
      const handlers: Record<string, () => Promise<void>> = {};
      vi.spyOn(process, 'on').mockImplementation(
        (event: string | symbol, listener: (...args: unknown[]) => void) => {
          handlers[String(event)] = listener as () => Promise<void>;
          return process;
        }
      );

      const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);

      const cmd = createServeCommand();
      await cmd.parseAsync(['--port', '4050'], { from: 'user' });

      await handlers['SIGINT']?.();

      expect(mockWebServerService.stop).toHaveBeenCalled();
      expect(exitSpy).toHaveBeenCalledWith(0);
      exitSpy.mockRestore();
      vi.restoreAllMocks();
    });
  });
});
