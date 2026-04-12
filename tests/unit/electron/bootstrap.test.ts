import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { DependencyContainer } from 'tsyringe';
import { bootstrapBackend, type BootstrapDeps } from '../../../packages/electron/src/bootstrap.js';

// Mock the dynamic import of InitializeSettingsUseCase
vi.mock('@shepai/core/application/use-cases/settings/initialize-settings.use-case.js', () => {
  const mockExecute = vi.fn().mockResolvedValue({ models: { default: 'test' } });
  return {
    InitializeSettingsUseCase: class {
      execute = mockExecute;
    },
  };
});

function createMockContainer(): DependencyContainer {
  const resolveMap = new Map<string | unknown, unknown>();

  // Set up default resolutions for known tokens
  resolveMap.set('IVersionService', {
    getVersion: () => ({ version: '1.0.0', name: '@shepai/cli', description: 'test' }),
  });
  resolveMap.set('IAgentRunRepository', {});
  resolveMap.set('IPhaseTimingRepository', {});
  resolveMap.set('IFeatureRepository', {});
  resolveMap.set('INotificationService', {});
  resolveMap.set('IGitPrService', {});
  resolveMap.set('IGitForkService', {});
  resolveMap.set('IDeploymentService', { stopAll: vi.fn() });

  return {
    resolve: vi.fn((token: string | unknown) => {
      // Handle class tokens (InitializeSettingsUseCase)
      if (typeof token === 'function') {
        return new (token as new () => unknown)();
      }
      return resolveMap.get(token) ?? {};
    }),
  } as unknown as DependencyContainer;
}

function createMockDeps(overrides: Partial<BootstrapDeps> = {}): BootstrapDeps {
  const container = createMockContainer();
  return {
    initializeContainer: vi.fn().mockResolvedValue(container),
    container,
    initializeSettings: vi.fn(),
    setVersionEnvVars: vi.fn(),
    initializeNotificationWatcher: vi.fn(),
    getNotificationWatcher: vi.fn(() => ({ start: vi.fn(), stop: vi.fn() })),
    initializePrSyncWatcher: vi.fn(),
    getPrSyncWatcher: vi.fn(() => ({ start: vi.fn(), stop: vi.fn() })),
    initializeAutoArchiveWatcher: vi.fn(),
    getAutoArchiveWatcher: vi.fn(() => ({ start: vi.fn(), stop: vi.fn() })),
    getExistingConnection: vi.fn(() => null),
    ...overrides,
  };
}

describe('bootstrapBackend', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Clean up globalThis
    delete (globalThis as Record<string, unknown>).__shepContainer;
  });

  it('calls initializeContainer()', async () => {
    const deps = createMockDeps();
    await bootstrapBackend(deps);
    expect(deps.initializeContainer).toHaveBeenCalledOnce();
  });

  it('exposes the container on globalThis.__shepContainer', async () => {
    const deps = createMockDeps();
    await bootstrapBackend(deps);
    expect((globalThis as Record<string, unknown>).__shepContainer).toBe(deps.container);
  });

  it('initializes settings', async () => {
    const deps = createMockDeps();
    await bootstrapBackend(deps);
    expect(deps.initializeSettings).toHaveBeenCalledWith(
      expect.objectContaining({ models: { default: 'test' } })
    );
  });

  it('sets version env vars', async () => {
    const deps = createMockDeps();
    await bootstrapBackend(deps);
    expect(deps.setVersionEnvVars).toHaveBeenCalledWith({
      version: '1.0.0',
      name: '@shepai/cli',
      description: 'test',
    });
  });

  it('starts notification watcher', async () => {
    const deps = createMockDeps();
    await bootstrapBackend(deps);
    expect(deps.initializeNotificationWatcher).toHaveBeenCalled();
    expect(deps.getNotificationWatcher).toHaveBeenCalled();
  });

  it('starts PR sync watcher', async () => {
    const deps = createMockDeps();
    await bootstrapBackend(deps);
    expect(deps.initializePrSyncWatcher).toHaveBeenCalled();
    expect(deps.getPrSyncWatcher).toHaveBeenCalled();
  });

  it('starts auto-archive watcher', async () => {
    const deps = createMockDeps();
    await bootstrapBackend(deps);
    expect(deps.initializeAutoArchiveWatcher).toHaveBeenCalled();
    expect(deps.getAutoArchiveWatcher).toHaveBeenCalled();
  });

  it('returns the container in the result', async () => {
    const deps = createMockDeps();
    const result = await bootstrapBackend(deps);
    expect(result.container).toBe(deps.container);
  });

  it('returns a shutdown function', async () => {
    const deps = createMockDeps();
    const result = await bootstrapBackend(deps);
    expect(result.shutdown).toBeTypeOf('function');
  });

  describe('shutdown', () => {
    it('stops all watchers', async () => {
      const notifWatcher = { start: vi.fn(), stop: vi.fn() };
      const prSyncWatcher = { start: vi.fn(), stop: vi.fn() };
      const archiveWatcher = { start: vi.fn(), stop: vi.fn() };

      const deps = createMockDeps({
        getNotificationWatcher: vi.fn(() => notifWatcher),
        getPrSyncWatcher: vi.fn(() => prSyncWatcher),
        getAutoArchiveWatcher: vi.fn(() => archiveWatcher),
      });

      const result = await bootstrapBackend(deps);
      result.shutdown();

      expect(notifWatcher.stop).toHaveBeenCalled();
      expect(prSyncWatcher.stop).toHaveBeenCalled();
      expect(archiveWatcher.stop).toHaveBeenCalled();
    });

    it('stops deployment service', async () => {
      const stopAll = vi.fn();
      const container = createMockContainer();
      vi.mocked(container.resolve).mockImplementation((token: string | unknown) => {
        if (token === 'IDeploymentService') return { stopAll };
        if (token === 'IVersionService') {
          return {
            getVersion: () => ({ version: '1.0.0', name: 'test', description: '' }),
          };
        }
        if (typeof token === 'function') return new (token as new () => unknown)();
        return {};
      });

      const deps = createMockDeps({ container });
      const result = await bootstrapBackend(deps);
      result.shutdown();

      expect(stopAll).toHaveBeenCalled();
    });

    it('does not throw if watcher getters throw during shutdown', async () => {
      // Bootstrap with working watchers first
      const deps = createMockDeps();
      const result = await bootstrapBackend(deps);

      // Now make the watcher getters throw (simulating not-initialized state on shutdown)
      vi.mocked(deps.getNotificationWatcher).mockImplementation(() => {
        throw new Error('not initialized');
      });
      vi.mocked(deps.getPrSyncWatcher).mockImplementation(() => {
        throw new Error('not initialized');
      });
      vi.mocked(deps.getAutoArchiveWatcher).mockImplementation(() => {
        throw new Error('not initialized');
      });

      // Should not throw
      expect(() => result.shutdown()).not.toThrow();
    });
  });

  describe('initialization order', () => {
    it('calls initializeContainer before resolving services', async () => {
      const callOrder: string[] = [];
      const container = createMockContainer();
      vi.mocked(container.resolve).mockImplementation((token: string | unknown) => {
        callOrder.push(`resolve:${String(token)}`);
        if (typeof token === 'function') return new (token as new () => unknown)();
        if (token === 'IVersionService') {
          return {
            getVersion: () => ({ version: '1.0.0', name: 'test', description: '' }),
          };
        }
        return {};
      });

      const deps = createMockDeps({
        container,
        initializeContainer: vi.fn(async () => {
          callOrder.push('initializeContainer');
          return container;
        }),
      });

      await bootstrapBackend(deps);

      const containerIdx = callOrder.indexOf('initializeContainer');
      const firstResolveIdx = callOrder.findIndex((c) => c.startsWith('resolve:'));
      expect(containerIdx).toBeLessThan(firstResolveIdx);
    });
  });
});
