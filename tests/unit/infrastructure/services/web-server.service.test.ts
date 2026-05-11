/**
 * Web Server Service Unit Tests
 *
 * Tests for Next.js programmatic server lifecycle management.
 * Uses constructor dependency injection for clean testability.
 *
 * TDD Phase: GREEN
 */

import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock the platform module so we can control IS_WINDOWS per-test.
// The getter re-evaluates each access, allowing Object.defineProperty
// on process.platform to take effect within each test.
vi.mock('@/infrastructure/platform.js', () => ({
  get IS_WINDOWS() {
    return process.platform === 'win32';
  },
}));

import {
  WebServerService,
  type WebServerDeps,
} from '@/infrastructure/services/web-server.service.js';

function createMockDeps() {
  const mockHandle = vi.fn();
  const mockApp = {
    prepare: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
    getRequestHandler: vi.fn().mockReturnValue(mockHandle),
  };

  const mockServer = {
    listen: vi.fn(),
    close: vi.fn(),
    closeAllConnections: vi.fn(),
    on: vi.fn().mockReturnThis(),
  };

  // Default: listen calls callback immediately
  mockServer.listen.mockImplementation((_port: number, _hostname: string, callback: () => void) => {
    callback();
    return mockServer;
  });

  // Default: close calls callback immediately
  mockServer.close.mockImplementation((callback?: () => void) => {
    if (callback) callback();
    return mockServer;
  });

  const deps: WebServerDeps = {
    createNextApp: vi.fn().mockReturnValue(mockApp) as any,
    createHttpServer: vi.fn().mockReturnValue(mockServer) as any,
  };

  return { deps, mockApp, mockServer, mockHandle };
}

describe('WebServerService', () => {
  let service: WebServerService;
  let mocks: ReturnType<typeof createMockDeps>;

  beforeEach(() => {
    vi.clearAllMocks();
    mocks = createMockDeps();
    service = new WebServerService(mocks.deps);
  });

  describe('start()', () => {
    it('should call createNextApp with correct options', async () => {
      await service.start(4050, '/path/to/web');

      expect(mocks.deps.createNextApp).toHaveBeenCalledWith({
        dev: true,
        dir: '/path/to/web',
        port: 4050,
        hostname: 'localhost',
      });
    });

    it('should pass dev flag to Next.js', async () => {
      await service.start(4050, '/path/to/web', false);

      expect(mocks.deps.createNextApp).toHaveBeenCalledWith(
        expect.objectContaining({ dev: false })
      );
    });

    it('should call app.prepare()', async () => {
      await service.start(4050, '/path/to/web');

      expect(mocks.mockApp.prepare).toHaveBeenCalled();
    });

    it('should create an HTTP server with the request handler', async () => {
      await service.start(4050, '/path/to/web');

      expect(mocks.mockApp.getRequestHandler).toHaveBeenCalled();
      expect(mocks.deps.createHttpServer).toHaveBeenCalledWith(expect.any(Function));
    });

    it('should listen on the specified port bound to 0.0.0.0 by default', async () => {
      await service.start(4050, '/path/to/web');

      expect(mocks.mockServer.listen).toHaveBeenCalledWith(4050, '0.0.0.0', expect.any(Function));
    });

    it('should listen on SHEP_BIND_HOST when set', async () => {
      const original = process.env.SHEP_BIND_HOST;
      process.env.SHEP_BIND_HOST = '127.0.0.1';
      try {
        await service.start(4050, '/path/to/web');
        expect(mocks.mockServer.listen).toHaveBeenCalledWith(
          4050,
          '127.0.0.1',
          expect.any(Function)
        );
      } finally {
        if (original === undefined) delete process.env.SHEP_BIND_HOST;
        else process.env.SHEP_BIND_HOST = original;
      }
    });
  });

  describe('stop()', () => {
    it('should close the HTTP server', async () => {
      await service.start(4050, '/path/to/web');
      await service.stop();

      expect(mocks.mockServer.close).toHaveBeenCalled();
    });

    it('should close the Next.js app', async () => {
      await service.start(4050, '/path/to/web');
      await service.stop();

      expect(mocks.mockApp.close).toHaveBeenCalled();
    });

    it('should be safe to call stop() without start()', async () => {
      await expect(service.stop()).resolves.not.toThrow();
    });
  });

  describe('error handling', () => {
    it('should propagate error when app.prepare() rejects', async () => {
      mocks.mockApp.prepare.mockRejectedValueOnce(new Error('Prepare failed'));

      await expect(service.start(4050, '/path/to/web')).rejects.toThrow('Prepare failed');
    });
  });

  describe('Windows cross-drive path fix', () => {
    const originalPlatform = process.platform;
    const originalCwd = process.cwd;

    afterEach(() => {
      Object.defineProperty(process, 'platform', { value: originalPlatform });
      process.cwd = originalCwd;
    });

    it('should chdir to web dir on Windows when drives differ', async () => {
      Object.defineProperty(process, 'platform', { value: 'win32' });
      process.cwd = vi.fn().mockReturnValue('D:\\cursor_ml_bot');
      const chdirSpy = vi.spyOn(process, 'chdir').mockImplementation(() => undefined);

      await service.start(4050, 'C:\\Users\\User\\web');

      // Should chdir to web dir before app.prepare()
      expect(chdirSpy).toHaveBeenCalledWith('C:\\Users\\User\\web');
      chdirSpy.mockRestore();
    });

    it('should NOT chdir on Windows when same drive', async () => {
      Object.defineProperty(process, 'platform', { value: 'win32' });
      process.cwd = vi.fn().mockReturnValue('C:\\Projects\\myapp');
      const chdirSpy = vi.spyOn(process, 'chdir').mockImplementation(() => undefined);

      await service.start(4050, 'C:\\Users\\User\\web');

      expect(chdirSpy).not.toHaveBeenCalled();
      chdirSpy.mockRestore();
    });

    it('should NOT chdir on non-Windows platforms', async () => {
      Object.defineProperty(process, 'platform', { value: 'darwin' });
      process.cwd = vi.fn().mockReturnValue('/Users/dev/project');
      const chdirSpy = vi.spyOn(process, 'chdir').mockImplementation(() => undefined);

      await service.start(4050, '/opt/shep/web');

      expect(chdirSpy).not.toHaveBeenCalled();
      chdirSpy.mockRestore();
    });
  });
});
