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
  ALLOW_PUBLIC_BIND_ENV,
  BIND_HOST_ENV,
  WEB_PORT_ENV,
  resolveBindHost,
  type WebServerDeps,
} from '@/infrastructure/services/web-server.service.js';
import type { GuardPolicy } from '@/infrastructure/services/web-auth/request-guard.js';

const UPGRADE_POLICY: GuardPolicy = {
  token: 'd'.repeat(64),
  port: 4050,
  extraHosts: [],
  requireTokenForPages: false,
};

function createMockDeps() {
  const mockHandle = vi.fn();
  const mockUpgradeHandle = vi.fn();
  const mockApp = {
    prepare: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
    getRequestHandler: vi.fn().mockReturnValue(mockHandle),
    getUpgradeHandler: vi.fn().mockReturnValue(mockUpgradeHandle),
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
    readUpgradePolicy: () => UPGRADE_POLICY,
  };

  return { deps, mockApp, mockServer, mockHandle, mockUpgradeHandle };
}

/** The listener the service registered for `event`, if any. */
function registeredListener(
  mockServer: ReturnType<typeof createMockDeps>['mockServer'],
  event: string
): ((...args: unknown[]) => void) | undefined {
  return mockServer.on.mock.calls.find(([name]) => name === event)?.[1];
}

function upgradeHandshake(host: string) {
  const req = { url: '/_next/hmr', headers: { host, origin: `http://${host}` } };
  const socket = { end: vi.fn(), destroy: vi.fn() };
  return { req, socket, head: Buffer.alloc(0) };
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

    it('should listen on the specified port', async () => {
      await service.start(4050, '/path/to/web');

      expect(mocks.mockServer.listen).toHaveBeenCalledWith(4050, 'localhost', expect.any(Function));
    });
  });

  describe('WebSocket upgrades', () => {
    it('forwards an HMR upgrade to Next.js in dev mode', async () => {
      await service.start(4050, '/path/to/web', true);

      const onUpgrade = registeredListener(mocks.mockServer, 'upgrade');
      expect(onUpgrade).toBeDefined();
      const { req, socket, head } = upgradeHandshake('localhost:4050');
      onUpgrade!(req, socket, head);

      expect(mocks.mockUpgradeHandle).toHaveBeenCalledWith(req, socket, head);
    });

    it('refuses an upgrade whose Host the request guard would refuse', async () => {
      await service.start(4050, '/path/to/web', true);

      const { req, socket, head } = upgradeHandshake('attacker.example:4050');
      registeredListener(mocks.mockServer, 'upgrade')!(req, socket, head);

      expect(mocks.mockUpgradeHandle).not.toHaveBeenCalled();
      expect(socket.end).toHaveBeenCalledWith(expect.stringContaining('403'), expect.any(Function));
    });

    it('accepts no upgrades in production mode, which has no HMR socket', async () => {
      await service.start(4050, '/path/to/web', false);

      expect(registeredListener(mocks.mockServer, 'upgrade')).toBeUndefined();
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

  describe('bind host validation', () => {
    const savedEnv: Record<string, string | undefined> = {};
    let warnSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      for (const key of [BIND_HOST_ENV, ALLOW_PUBLIC_BIND_ENV, WEB_PORT_ENV]) {
        savedEnv[key] = process.env[key];
        delete process.env[key];
      }
      warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    });

    afterEach(() => {
      for (const [key, value] of Object.entries(savedEnv)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
      warnSpy.mockRestore();
    });

    it('binds loopback by default', async () => {
      await service.start(4050, '/path/to/web');

      expect(mocks.mockServer.listen).toHaveBeenCalledWith(4050, 'localhost', expect.any(Function));
    });

    it.each(['127.0.0.1', '::1', 'localhost'])(
      'accepts the loopback bind host %s',
      async (host) => {
        process.env[BIND_HOST_ENV] = host;

        await service.start(4050, '/path/to/web');

        expect(mocks.mockServer.listen).toHaveBeenCalledWith(4050, host, expect.any(Function));
      }
    );

    it('refuses a public bind host and falls back to loopback', async () => {
      // SHEP_BIND_HOST used to be an unvalidated override of the production
      // loopback bind — 0.0.0.0 exposed an unauthenticated PTY to the LAN.
      process.env[BIND_HOST_ENV] = '0.0.0.0';

      await service.start(4050, '/path/to/web');

      expect(mocks.mockServer.listen).toHaveBeenCalledWith(4050, 'localhost', expect.any(Function));
      expect(warnSpy).toHaveBeenCalled();
    });

    it('honours a public bind host only behind the explicit opt-in, loudly', async () => {
      process.env[BIND_HOST_ENV] = '0.0.0.0';
      process.env[ALLOW_PUBLIC_BIND_ENV] = '1';

      await service.start(4050, '/path/to/web');

      expect(mocks.mockServer.listen).toHaveBeenCalledWith(4050, '0.0.0.0', expect.any(Function));
      expect(warnSpy).toHaveBeenCalled();
    });

    it('publishes the listening port so the middleware can validate Host headers', async () => {
      await service.start(4050, '/path/to/web');

      expect(process.env[WEB_PORT_ENV]).toBe('4050');
    });

    describe('resolveBindHost (shared with the dev server)', () => {
      it('defaults to loopback when nothing is requested', () => {
        expect(resolveBindHost(undefined, false)).toEqual({ host: 'localhost', warning: null });
      });

      it('reports why a public bind was downgraded', () => {
        const resolved = resolveBindHost('0.0.0.0', false);

        expect(resolved.host).toBe('localhost');
        expect(resolved.warning).toContain('0.0.0.0');
      });

      it('warns but obeys when the public bind is explicitly allowed', () => {
        const resolved = resolveBindHost('0.0.0.0', true);

        expect(resolved.host).toBe('0.0.0.0');
        expect(resolved.warning).toBeTruthy();
      });

      it('never warns for a loopback bind', () => {
        expect(resolveBindHost('127.0.0.1', true)).toEqual({ host: '127.0.0.1', warning: null });
      });
    });
  });
});
