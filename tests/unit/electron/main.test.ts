import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { DependencyContainer } from 'tsyringe';
import type { IWebServerService } from '@shepai/core/application/ports/output/services/web-server-service.interface.js';

// ── Hoisted mocks (must be declared before vi.mock) ────────────────

const {
  mockBootstrapBackend,
  mockSetupTray,
  mockRegisterElectronAdapters,
  mockSetupIpcHandlers,
  mockResolvePort,
  mockCheckForUpdates,
} = vi.hoisted(() => ({
  mockBootstrapBackend: vi.fn(),
  mockSetupTray: vi.fn(() => ({
    setContextMenu: vi.fn(),
    setToolTip: vi.fn(),
    on: vi.fn(),
  })),
  mockRegisterElectronAdapters: vi.fn(() => ({
    notifier: { send: vi.fn(), startListening: vi.fn(), stopListening: vi.fn() },
    opener: { open: vi.fn() },
    cleanup: vi.fn(),
  })),
  mockSetupIpcHandlers: vi.fn(),
  mockResolvePort: vi.fn(async () => ({ port: 3456, startServer: true })),
  mockCheckForUpdates: vi.fn(),
}));

vi.mock('../../../packages/electron/src/bootstrap.js', () => ({
  bootstrapBackend: mockBootstrapBackend,
}));

vi.mock('../../../packages/electron/src/resolve-web-dir.js', () => ({
  resolveWebDirForElectron: vi.fn(() => ({ dir: '/mock/web/dir', dev: false })),
}));

vi.mock('../../../packages/electron/src/tray.js', () => ({
  setupTray: mockSetupTray,
}));

vi.mock('../../../packages/electron/src/electron-adapters.js', () => ({
  registerElectronAdapters: mockRegisterElectronAdapters,
}));

vi.mock('../../../packages/electron/src/ipc/channels.js', () => ({
  setupIpcHandlers: mockSetupIpcHandlers,
}));

vi.mock('../../../packages/electron/src/port-conflict.js', () => ({
  resolvePort: mockResolvePort,
}));

vi.mock('../../../packages/electron/src/update-checker.js', () => ({
  checkForUpdates: mockCheckForUpdates,
}));

vi.mock('@shepai/core/application/use-cases/settings/initialize-settings.use-case.js', () => ({
  InitializeSettingsUseCase: class {
    execute = vi.fn().mockResolvedValue({});
  },
}));

// ── Imports (after mocks) ──────────────────────────────────────────

import {
  createSplashWindow,
  createMainWindow,
  gracefulShutdown,
  startApp,
  type AppDeps,
  type AppBrowserWindow,
  type AppElectronApi,
  type AppState,
} from '../../../packages/electron/src/app.js';

// ── Test helpers ───────────────────────────────────────────────────

/** Create a mock BrowserWindow instance with event tracking */
function createMockWindow(): AppBrowserWindow & {
  _onceHandlers: Map<string, (() => void)[]>;
  _onHandlers: Map<string, ((...args: unknown[]) => void)[]>;
} {
  const onceHandlers = new Map<string, (() => void)[]>();
  const onHandlers = new Map<string, ((...args: unknown[]) => void)[]>();

  return {
    loadFile: vi.fn(),
    loadURL: vi.fn(),
    once: vi.fn((event: string, listener: () => void) => {
      const handlers = onceHandlers.get(event) ?? [];
      handlers.push(listener);
      onceHandlers.set(event, handlers);
    }),
    on: vi.fn((event: string, listener: (...args: unknown[]) => void) => {
      const handlers = onHandlers.get(event) ?? [];
      handlers.push(listener);
      onHandlers.set(event, handlers);
    }),
    show: vi.fn(),
    focus: vi.fn(),
    hide: vi.fn(),
    close: vi.fn(),
    minimize: vi.fn(),
    isDestroyed: vi.fn(() => false),
    isMinimized: vi.fn(() => false),
    restore: vi.fn(),
    webContents: { send: vi.fn() },
    _onceHandlers: onceHandlers,
    _onHandlers: onHandlers,
  };
}

/** BrowserWindow class mock — vi.fn() can't be used with `new` */
function createMockBrowserWindowClass() {
  const instances: ReturnType<typeof createMockWindow>[] = [];
  const allOpts: Record<string, unknown>[] = [];

  class MockBrowserWindow {
    constructor(opts: Record<string, unknown>) {
      allOpts.push(opts);
      const win = createMockWindow();
      instances.push(win);
      return win as unknown as MockBrowserWindow;
    }
  }

  return {
    MockBW: MockBrowserWindow as unknown as new (opts: Record<string, unknown>) => AppBrowserWindow,
    instances,
    allOpts,
  };
}

/** Mock Electron app with event tracking */
function createMockApp() {
  const handlers = new Map<string, ((...args: unknown[]) => void)[]>();

  return {
    requestSingleInstanceLock: vi.fn(() => true),
    on: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
      const arr = handlers.get(event) ?? [];
      arr.push(handler);
      handlers.set(event, arr);
    }),
    whenReady: vi.fn(() => Promise.resolve()),
    quit: vi.fn(),
    exit: vi.fn(),
    isPackaged: false,
    _handlers: handlers,
    _fireEvent(event: string, ...args: unknown[]) {
      const arr = handlers.get(event) ?? [];
      for (const h of arr) h(...args);
    },
  };
}

/** Mock DI container */
function createMockContainer() {
  const mockWebServer = { start: vi.fn(), stop: vi.fn() };

  return {
    container: {
      resolve: vi.fn((token: string | unknown) => {
        if (token === 'IWebServerService') return mockWebServer;
        return {};
      }),
      register: vi.fn(),
    } as unknown as DependencyContainer,
    mockWebServer,
  };
}

/** Create full AppDeps for startApp tests */
function createMockDeps(overrides: Partial<AppDeps> = {}) {
  const { MockBW, instances: bwInstances, allOpts: bwOpts } = createMockBrowserWindowClass();
  const mockApp = createMockApp();
  const { container, mockWebServer } = createMockContainer();
  const mockShutdown = vi.fn();

  mockBootstrapBackend.mockResolvedValue({
    container,
    shutdown: mockShutdown,
  });

  const deps: AppDeps = {
    electron: {
      app: mockApp,
      BrowserWindow: MockBW,
      Tray: class MockTray {
        setContextMenu = vi.fn();
        setToolTip = vi.fn();
        on = vi.fn();
      } as unknown as AppElectronApi['Tray'],
      Menu: { buildFromTemplate: vi.fn(() => 'mock-menu') },
      nativeImage: {
        createFromPath: vi.fn(() => ({ setTemplateImage: vi.fn() })),
      },
    },
    windowStateKeeper: vi.fn(() => ({
      x: 100,
      y: 100,
      width: 1280,
      height: 800,
      manage: vi.fn(),
    })),
    bootstrapDeps: {
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
    },
    findAvailablePort: vi.fn(() => Promise.resolve(3456)),
    defaultPort: 3000,
    resolveWebDirDeps: {
      isPackaged: false,
      resourcesPath: '/mock/resources',
      existsSync: vi.fn(() => true),
      basedir: '/mock/basedir',
    },
    resourcesDir: '/mock/resources',
    splashHtmlPath: '/mock/splash.html',
    preloadPath: '/mock/preload.js',
    adapterDeps: {
      createDesktopNotifier: vi.fn() as never,
      createBrowserOpener: vi.fn() as never,
      getNotificationBus: vi.fn() as never,
    },
    portConflictDeps: {
      defaultPort: 3000,
      isPortAvailable: vi.fn().mockResolvedValue(true),
      showDialog: vi.fn().mockResolvedValue(0),
      warn: vi.fn(),
    },
    ipcHandlerDeps: {
      ipcMain: { handle: vi.fn(), on: vi.fn() },
      getVersion: vi.fn(() => '1.0.0'),
    },
    updateCheckerDeps: {
      currentVersion: '1.0.0',
      repoOwner: 'test',
      repoName: 'test',
      fetch: vi.fn().mockResolvedValue({ ok: false, json: vi.fn() }),
      warn: vi.fn(),
    },
    ...overrides,
  };

  return { deps, mockApp, bwInstances, bwOpts, mockShutdown, mockWebServer, container };
}

/** Helper to create a valid AppState */
function makeState(overrides: Partial<AppState> = {}): AppState {
  return {
    mainWindow: null,
    splashWindow: null,
    tray: null,
    bootstrapResult: null,
    adapterResult: null,
    webServerService: null,
    serverPort: 0,
    isQuitting: false,
    ...overrides,
  };
}

// ── Tests ──────────────────────────────────────────────────────────

describe('createSplashWindow', () => {
  it('creates a frameless window with correct dimensions', () => {
    const { MockBW, allOpts } = createMockBrowserWindowClass();
    createSplashWindow(MockBW, '/mock/splash.html');

    expect(allOpts).toHaveLength(1);
    expect(allOpts[0].width).toBe(400);
    expect(allOpts[0].height).toBe(300);
    expect(allOpts[0].frame).toBe(false);
    expect(allOpts[0].resizable).toBe(false);
    expect(allOpts[0].alwaysOnTop).toBe(true);
    expect(allOpts[0].show).toBe(false);
  });

  it('applies security settings (nodeIntegration=false, contextIsolation=true)', () => {
    const { MockBW, allOpts } = createMockBrowserWindowClass();
    createSplashWindow(MockBW, '/mock/splash.html');

    const prefs = allOpts[0].webPreferences as Record<string, unknown>;
    expect(prefs.nodeIntegration).toBe(false);
    expect(prefs.contextIsolation).toBe(true);
  });

  it('loads the splash HTML file', () => {
    const { MockBW, instances } = createMockBrowserWindowClass();
    createSplashWindow(MockBW, '/mock/splash.html');
    expect(instances[0].loadFile).toHaveBeenCalledWith('/mock/splash.html');
  });

  it('registers ready-to-show handler', () => {
    const { MockBW, instances } = createMockBrowserWindowClass();
    createSplashWindow(MockBW, '/mock/splash.html');
    expect(instances[0].once).toHaveBeenCalledWith('ready-to-show', expect.any(Function));
  });
});

describe('createMainWindow', () => {
  const mockWindowState = vi.fn(() => ({
    x: 100,
    y: 200,
    width: 1280,
    height: 800,
    manage: vi.fn(),
  }));

  it('creates window with security settings', () => {
    const { MockBW, allOpts } = createMockBrowserWindowClass();
    createMainWindow(MockBW, mockWindowState, 3456, '/mock/preload.js', makeState());

    const prefs = allOpts[0].webPreferences as Record<string, unknown>;
    expect(prefs.nodeIntegration).toBe(false);
    expect(prefs.contextIsolation).toBe(true);
    expect(prefs.sandbox).toBe(true);
  });

  it('sets preload path in web preferences', () => {
    const { MockBW, allOpts } = createMockBrowserWindowClass();
    createMainWindow(MockBW, mockWindowState, 3456, '/mock/preload.js', makeState());

    const prefs = allOpts[0].webPreferences as Record<string, unknown>;
    expect(prefs.preload).toBe('/mock/preload.js');
  });

  it('sets minimum window dimensions', () => {
    const { MockBW, allOpts } = createMockBrowserWindowClass();
    createMainWindow(MockBW, mockWindowState, 3456, '/mock/preload.js', makeState());
    expect(allOpts[0].minWidth).toBe(800);
    expect(allOpts[0].minHeight).toBe(600);
  });

  it('sets window title to shep', () => {
    const { MockBW, allOpts } = createMockBrowserWindowClass();
    createMainWindow(MockBW, mockWindowState, 3456, '/mock/preload.js', makeState());
    expect(allOpts[0].title).toBe('shep');
  });

  it('loads localhost URL with the given port', () => {
    const { MockBW, instances } = createMockBrowserWindowClass();
    createMainWindow(MockBW, mockWindowState, 3456, '/mock/preload.js', makeState());
    expect(instances[0].loadURL).toHaveBeenCalledWith('http://localhost:3456');
  });

  it('hides window on close when not quitting', () => {
    const { MockBW, instances } = createMockBrowserWindowClass();
    createMainWindow(MockBW, mockWindowState, 3456, '/mock/preload.js', makeState());

    const win = instances[0];
    const closeHandler = win._onHandlers.get('close')?.[0];
    expect(closeHandler).toBeDefined();

    const mockEvent = { preventDefault: vi.fn() };
    closeHandler!(mockEvent);

    expect(mockEvent.preventDefault).toHaveBeenCalled();
    expect(win.hide).toHaveBeenCalled();
  });

  it('allows window close when quitting', () => {
    const { MockBW, instances } = createMockBrowserWindowClass();
    createMainWindow(
      MockBW,
      mockWindowState,
      3456,
      '/mock/preload.js',
      makeState({ isQuitting: true })
    );

    const win = instances[0];
    const closeHandler = win._onHandlers.get('close')?.[0];
    const mockEvent = { preventDefault: vi.fn() };
    closeHandler!(mockEvent);

    expect(mockEvent.preventDefault).not.toHaveBeenCalled();
    expect(win.hide).not.toHaveBeenCalled();
  });

  it('calls windowStateKeeper.manage on the window', () => {
    const { MockBW, instances } = createMockBrowserWindowClass();
    const manage = vi.fn();
    const stateKeeper = vi.fn(() => ({
      x: 100,
      y: 200,
      width: 1280,
      height: 800,
      manage,
    }));

    createMainWindow(MockBW, stateKeeper, 3456, '/mock/preload.js', makeState());
    expect(manage).toHaveBeenCalledWith(instances[0]);
  });
});

describe('gracefulShutdown', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('calls adapterResult.cleanup()', async () => {
    const mockCleanup = vi.fn();
    const state = makeState({
      adapterResult: {
        notifier: { send: vi.fn(), startListening: vi.fn(), stopListening: vi.fn() } as never,
        opener: { open: vi.fn() } as never,
        cleanup: mockCleanup,
      },
    });

    await gracefulShutdown(state);
    expect(mockCleanup).toHaveBeenCalled();
  });

  it('calls bootstrapResult.shutdown()', async () => {
    const mockShutdown = vi.fn();
    const state = makeState({
      bootstrapResult: { container: {} as DependencyContainer, shutdown: mockShutdown },
    });

    await gracefulShutdown(state);
    expect(mockShutdown).toHaveBeenCalled();
  });

  it('calls webServerService.stop()', async () => {
    const mockStop = vi.fn().mockResolvedValue(undefined);
    const state = makeState({
      webServerService: { start: vi.fn(), stop: mockStop } as unknown as IWebServerService,
    });

    await gracefulShutdown(state);
    expect(mockStop).toHaveBeenCalled();
  });

  it('does not throw when bootstrapResult is null', async () => {
    const state = makeState();
    await expect(gracefulShutdown(state)).resolves.not.toThrow();
  });
});

describe('startApp', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockResolvePort.mockResolvedValue({ port: 3456, startServer: true });
  });

  it('requests single instance lock', async () => {
    const { deps, mockApp } = createMockDeps();
    await startApp(deps);
    expect(mockApp.requestSingleInstanceLock).toHaveBeenCalledOnce();
  });

  it('quits when single instance lock is not acquired', async () => {
    const { deps, mockApp } = createMockDeps();
    mockApp.requestSingleInstanceLock.mockReturnValue(false);
    const state = await startApp(deps);
    expect(mockApp.quit).toHaveBeenCalled();
    expect(state.mainWindow).toBeNull();
  });

  it('creates splash window as first BrowserWindow', async () => {
    const { deps, bwOpts } = createMockDeps();
    await startApp(deps);

    expect(bwOpts[0].frame).toBe(false);
    expect(bwOpts[0].width).toBe(400);
    expect(bwOpts[0].height).toBe(300);
  });

  it('creates main window as second BrowserWindow with security settings', async () => {
    const { deps, bwOpts } = createMockDeps();
    await startApp(deps);

    expect(bwOpts[1]).toBeDefined();
    expect(bwOpts[1].title).toBe('shep');
    const prefs = bwOpts[1].webPreferences as Record<string, unknown>;
    expect(prefs.nodeIntegration).toBe(false);
    expect(prefs.contextIsolation).toBe(true);
    expect(prefs.sandbox).toBe(true);
  });

  it('calls bootstrapBackend', async () => {
    const { deps } = createMockDeps();
    await startApp(deps);
    expect(mockBootstrapBackend).toHaveBeenCalled();
  });

  it('calls registerElectronAdapters', async () => {
    const { deps } = createMockDeps();
    await startApp(deps);
    expect(mockRegisterElectronAdapters).toHaveBeenCalled();
  });

  it('calls setupIpcHandlers', async () => {
    const { deps } = createMockDeps();
    await startApp(deps);
    expect(mockSetupIpcHandlers).toHaveBeenCalled();
  });

  it('calls checkForUpdates', async () => {
    const { deps } = createMockDeps();
    await startApp(deps);
    expect(mockCheckForUpdates).toHaveBeenCalled();
  });

  it('calls resolvePort for port conflict detection', async () => {
    const { deps } = createMockDeps();
    await startApp(deps);
    expect(mockResolvePort).toHaveBeenCalled();
  });

  it('calls setupTray', async () => {
    const { deps } = createMockDeps();
    await startApp(deps);
    expect(mockSetupTray).toHaveBeenCalled();
  });

  it('loads localhost URL with discovered port', async () => {
    const { deps, bwInstances } = createMockDeps();
    await startApp(deps);
    expect(bwInstances[1].loadURL).toHaveBeenCalledWith('http://localhost:3456');
  });

  it('registers before-quit handler that sets isQuitting', async () => {
    const { deps, mockApp } = createMockDeps();
    const state = await startApp(deps);

    expect(state.isQuitting).toBe(false);
    mockApp._fireEvent('before-quit');
    expect(state.isQuitting).toBe(true);
  });

  it('registers will-quit handler for graceful shutdown', async () => {
    const { deps, mockApp, mockShutdown } = createMockDeps();
    await startApp(deps);

    expect(mockApp._handlers.has('will-quit')).toBe(true);

    const mockEvent = { preventDefault: vi.fn() };
    const handler = mockApp._handlers.get('will-quit')![0];
    await handler(mockEvent);

    expect(mockEvent.preventDefault).toHaveBeenCalled();
    expect(mockShutdown).toHaveBeenCalled();
    expect(mockApp.exit).toHaveBeenCalledWith(0);
  });

  it('registers activate handler for macOS dock click', async () => {
    const { deps, mockApp } = createMockDeps();
    await startApp(deps);
    expect(mockApp._handlers.has('activate')).toBe(true);
  });

  it('returns state with all created resources', async () => {
    const { deps } = createMockDeps();
    const state = await startApp(deps);

    expect(state.mainWindow).not.toBeNull();
    expect(state.splashWindow).not.toBeNull();
    expect(state.tray).not.toBeNull();
    expect(state.bootstrapResult).not.toBeNull();
    expect(state.adapterResult).not.toBeNull();
    expect(state.webServerService).not.toBeNull();
  });

  it('skips web server start when port conflict resolves to connect-to-existing', async () => {
    mockResolvePort.mockResolvedValue({ port: 4050, startServer: false });
    const { deps, mockWebServer } = createMockDeps();
    const state = await startApp(deps);

    expect(mockWebServer.start).not.toHaveBeenCalled();
    expect(state.webServerService).toBeNull();
    expect(state.serverPort).toBe(4050);
  });

  it('quits and closes splash on fatal error during bootstrap', async () => {
    const { deps, mockApp } = createMockDeps();
    mockBootstrapBackend.mockRejectedValueOnce(new Error('bootstrap failed'));

    const state = await startApp(deps);
    expect(mockApp.quit).toHaveBeenCalled();
    expect(state.mainWindow).toBeNull();
  });
});
