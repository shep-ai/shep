/**
 * Tests for the Phase 3 wiring in app.ts:
 * - DI token overrides for Electron adapters
 * - ElectronDesktopNotifier.startListening() / stopListening()
 * - IPC handler setup
 * - Update checker startup
 * - Port conflict detection
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  registerElectronAdapters,
  type ElectronAdapterDeps,
} from '../../../packages/electron/src/electron-adapters.js';

function createMockContainer() {
  const registrations = new Map<string, { useFactory: () => unknown }>();
  return {
    register: vi.fn((token: string, provider: { useFactory: () => unknown }) => {
      registrations.set(token, provider);
    }),
    resolve: vi.fn((token: string) => {
      const reg = registrations.get(token);
      return reg ? reg.useFactory() : {};
    }),
    _registrations: registrations,
  };
}

function createMockDeps(overrides: Partial<ElectronAdapterDeps> = {}): ElectronAdapterDeps {
  const mockNotifier = {
    send: vi.fn(),
    startListening: vi.fn(),
    stopListening: vi.fn(),
  };

  const mockOpener = {
    open: vi.fn(),
  };

  return {
    container: createMockContainer() as never,
    createDesktopNotifier: vi.fn(() => mockNotifier) as never,
    createBrowserOpener: vi.fn(() => mockOpener) as never,
    getNotificationBus: vi.fn(() => ({ on: vi.fn(), removeListener: vi.fn() })) as never,
    ...overrides,
  };
}

describe('registerElectronAdapters', () => {
  let deps: ElectronAdapterDeps;

  beforeEach(() => {
    deps = createMockDeps();
  });

  it('registers DesktopNotifier DI token with ElectronDesktopNotifier', () => {
    registerElectronAdapters(deps);

    expect(deps.container.register).toHaveBeenCalledWith('DesktopNotifier', {
      useFactory: expect.any(Function),
    });
  });

  it('registers IBrowserOpener DI token with ElectronBrowserOpener', () => {
    registerElectronAdapters(deps);

    expect(deps.container.register).toHaveBeenCalledWith('IBrowserOpener', {
      useFactory: expect.any(Function),
    });
  });

  it('calls createDesktopNotifier factory when DI token is resolved', () => {
    registerElectronAdapters(deps);

    // Get the registered factory and invoke it
    const registerCalls = vi.mocked(deps.container.register).mock.calls;
    const notifierCall = registerCalls.find(([token]) => token === 'DesktopNotifier');
    const factory = (notifierCall![1] as unknown as { useFactory: () => unknown }).useFactory;
    factory();

    expect(deps.createDesktopNotifier).toHaveBeenCalled();
  });

  it('starts listening on the notification bus', () => {
    const result = registerElectronAdapters(deps);

    expect(result.notifier.startListening).toHaveBeenCalled();
  });

  it('returns a cleanup function that stops listening', () => {
    const result = registerElectronAdapters(deps);

    result.cleanup();

    expect(result.notifier.stopListening).toHaveBeenCalled();
  });
});
