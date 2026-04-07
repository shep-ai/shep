/**
 * UI Command Unit Tests
 *
 * Tests for the `shep ui` command.
 *
 * TDD Phase: GREEN
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Command } from 'commander';

// Mock the port service - factory must not reference outer variables (hoisted)
vi.mock('@/infrastructure/services/port.service.js', () => ({
  findAvailablePort: vi.fn(),
  DEFAULT_PORT: 4050,
}));

// Mock web server service instance (shared so tests can inspect calls)
const mockWebServerService = {
  start: vi.fn().mockResolvedValue(undefined),
  stop: vi.fn().mockResolvedValue(undefined),
};

// Mock the DI container - returns different services based on token
vi.mock('@/infrastructure/di/container.js', () => ({
  container: {
    resolve: vi.fn().mockImplementation((token: string) => {
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
      if (token === 'IBrowserOpener') {
        return { open: mockBrowserOpen };
      }
      // Return empty stubs for notification-related and PR sync services
      if (
        token === 'IAgentRunRepository' ||
        token === 'IPhaseTimingRepository' ||
        token === 'INotificationService' ||
        token === 'IFeatureRepository' ||
        token === 'IGitPrService' ||
        token === 'IGitForkService'
      ) {
        return {};
      }
      throw new Error(`Unknown token: ${token}`);
    }),
  },
}));

// Mock setVersionEnvVars (standalone utility, not part of DI)
vi.mock('@/infrastructure/services/version.service.js', () => ({
  setVersionEnvVars: vi.fn(),
}));

// Mock resolveWebDir (standalone function, not part of DI)
vi.mock('@/infrastructure/services/web-server.service.js', () => ({
  resolveWebDir: vi.fn().mockReturnValue({
    dir: '/mock/web/dir',
    dev: true,
  }),
}));

// Mock notification watcher service (requires start/stop methods)
vi.mock('@/infrastructure/services/notifications/notification-watcher.service.js', () => ({
  initializeNotificationWatcher: vi.fn(),
  getNotificationWatcher: vi.fn().mockReturnValue({
    start: vi.fn(),
    stop: vi.fn(),
  }),
}));

// Mock PR sync watcher service (requires start/stop methods)
vi.mock('@/infrastructure/services/pr-sync/pr-sync-watcher.service.js', () => ({
  initializePrSyncWatcher: vi.fn(),
  getPrSyncWatcher: vi.fn().mockReturnValue({
    start: vi.fn(),
    stop: vi.fn(),
  }),
}));

// Mock auto-archive watcher service (requires start/stop methods)
vi.mock('@/infrastructure/services/auto-archive/auto-archive-watcher.service.js', () => ({
  initializeAutoArchiveWatcher: vi.fn(),
  getAutoArchiveWatcher: vi.fn().mockReturnValue({
    start: vi.fn(),
    stop: vi.fn(),
  }),
}));

// Mock IBrowserOpener — resolved from DI container
const mockBrowserOpen = vi.fn();

import { findAvailablePort } from '@/infrastructure/services/port.service.js';
import { resolveWebDir } from '@/infrastructure/services/web-server.service.js';
import { createUiCommand } from '../../../../../src/presentation/cli/commands/ui.command.js';

describe('UI Command', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (findAvailablePort as ReturnType<typeof vi.fn>).mockResolvedValue(4050);
    mockWebServerService.start.mockClear();
    mockWebServerService.stop.mockClear();
    mockBrowserOpen.mockClear();
    process.exitCode = undefined;
  });

  describe('command structure', () => {
    it('should create a valid Commander command', () => {
      const cmd = createUiCommand();
      expect(cmd).toBeInstanceOf(Command);
    });

    it('should have the name "ui"', () => {
      const cmd = createUiCommand();
      expect(cmd.name()).toBe('ui');
    });

    it('should have a description', () => {
      const cmd = createUiCommand();
      expect(cmd.description()).toBeTruthy();
    });

    it('should have a --port option', () => {
      const cmd = createUiCommand();
      const portOption = cmd.options.find((o) => o.long === '--port');
      expect(portOption).toBeDefined();
    });
  });

  describe('command execution', () => {
    it('should call findAvailablePort with default port when no --port specified', async () => {
      const cmd = createUiCommand();
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(vi.fn());

      await cmd.parseAsync([], { from: 'user' });

      expect(findAvailablePort).toHaveBeenCalledWith(4050);
      consoleSpy.mockRestore();
    });

    it('should call resolveWebDir to find the web UI directory', async () => {
      const cmd = createUiCommand();
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(vi.fn());

      await cmd.parseAsync([], { from: 'user' });

      expect(resolveWebDir).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it('should start the web server service', async () => {
      const cmd = createUiCommand();
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(vi.fn());

      await cmd.parseAsync([], { from: 'user' });

      expect(mockWebServerService.start).toHaveBeenCalledWith(4050, '/mock/web/dir', true);
      consoleSpy.mockRestore();
    });
  });

  describe('--port override', () => {
    it('should use the provided port directly', async () => {
      const cmd = createUiCommand();
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(vi.fn());

      await cmd.parseAsync(['--port', '8080'], { from: 'user' });

      expect(findAvailablePort).toHaveBeenCalledWith(8080);
      consoleSpy.mockRestore();
    });
  });

  describe('error handling', () => {
    it('should handle port service errors gracefully', async () => {
      (findAvailablePort as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
        new Error('No available port')
      );

      const cmd = createUiCommand();
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(vi.fn());
      const logSpy = vi.spyOn(console, 'log').mockImplementation(vi.fn());

      await cmd.parseAsync([], { from: 'user' });

      expect(process.exitCode).toBe(1);
      errorSpy.mockRestore();
      logSpy.mockRestore();
    });

    it('should validate port range', () => {
      const cmd = createUiCommand();
      const portOption = cmd.options.find((o) => o.long === '--port');
      expect(portOption).toBeDefined();
      expect(portOption!.flags).toContain('<number>');
    });
  });

  describe('--no-open flag', () => {
    it('should have a --no-open option', () => {
      const cmd = createUiCommand();
      const noOpenOption = cmd.options.find((o) => o.long === '--no-open');
      expect(noOpenOption).toBeDefined();
    });
  });

  describe('auto-open browser', () => {
    it('should open browser with correct URL after server start by default', async () => {
      const cmd = createUiCommand();
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(vi.fn());

      await cmd.parseAsync([], { from: 'user' });

      expect(mockBrowserOpen).toHaveBeenCalledWith('http://localhost:4050');
      consoleSpy.mockRestore();
    });

    it('should open browser with custom port URL', async () => {
      (findAvailablePort as ReturnType<typeof vi.fn>).mockResolvedValue(9090);
      const cmd = createUiCommand();
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(vi.fn());

      await cmd.parseAsync(['--port', '9090'], { from: 'user' });

      expect(mockBrowserOpen).toHaveBeenCalledWith('http://localhost:9090');
      consoleSpy.mockRestore();
    });

    it('should NOT open browser when --no-open is passed', async () => {
      const cmd = createUiCommand();
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(vi.fn());

      await cmd.parseAsync(['--no-open'], { from: 'user' });

      expect(mockBrowserOpen).not.toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });
});
