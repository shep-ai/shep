/**
 * Electron Application Lifecycle
 *
 * Contains the core application logic extracted from main.ts for testability.
 * All Electron dependencies are injected so the module can be tested without
 * requiring the electron runtime.
 *
 * Handles:
 * - Single instance lock
 * - Splash screen → bootstrap → main window sequence
 * - Minimize-to-tray on window close
 * - Graceful shutdown (watchers + web server)
 */

import { bootstrapBackend, type BootstrapDeps, type BootstrapResult } from './bootstrap.js';
import { resolveWebDirForElectron, type ResolveWebDirDeps } from './resolve-web-dir.js';
import { setupTray, type TrayInstance } from './tray.js';
import {
  registerElectronAdapters,
  type ElectronAdapterDeps,
  type ElectronAdapterResult,
} from './electron-adapters.js';
import { setupIpcHandlers, type IpcHandlerDeps } from './ipc/channels.js';
import { resolvePort, type PortConflictDeps } from './port-conflict.js';
import { checkForUpdates, type UpdateCheckerDeps } from './update-checker.js';
import type { IWebServerService } from '@shepai/core/application/ports/output/services/web-server-service.interface.js';

/* eslint-disable no-console */

const TAG = '[electron]';

/** Minimal BrowserWindow-like interface for the app module. */
export interface AppBrowserWindow {
  loadFile(filePath: string): void;
  loadURL(url: string): void;
  once(event: string, listener: () => void): void;
  on(event: string, listener: (...args: unknown[]) => void): void;
  show(): void;
  focus(): void;
  hide(): void;
  close(): void;
  minimize(): void;
  isDestroyed(): boolean;
  isMinimized(): boolean;
  restore(): void;
  webContents: { send(channel: string, data: unknown): void };
}

/** Electron app API surface needed by the application module. */
export interface AppElectronApi {
  app: {
    requestSingleInstanceLock(): boolean;
    on(event: string, handler: (...args: unknown[]) => void): void;
    whenReady(): Promise<void>;
    quit(): void;
    exit(code: number): void;
    isPackaged: boolean;
  };
  BrowserWindow: new (opts: Record<string, unknown>) => AppBrowserWindow;
  Tray: new (image: unknown) => TrayInstance;
  Menu: { buildFromTemplate(template: unknown[]): unknown };
  nativeImage: { createFromPath(p: string): { setTemplateImage(v: boolean): void } };
}

/** Dependencies for the app lifecycle. */
export interface AppDeps {
  electron: AppElectronApi;
  windowStateKeeper: (opts: { defaultWidth: number; defaultHeight: number }) => {
    x: number | undefined;
    y: number | undefined;
    width: number;
    height: number;
    manage(win: unknown): void;
  };
  bootstrapDeps: BootstrapDeps;
  findAvailablePort: (defaultPort: number) => Promise<number>;
  defaultPort: number;
  resolveWebDirDeps: ResolveWebDirDeps;
  resourcesDir: string;
  splashHtmlPath: string;
  preloadPath: string;
  /** Factory deps for Electron adapter DI overrides. */
  adapterDeps: Omit<ElectronAdapterDeps, 'container'>;
  /** Factory for port conflict deps (needs serverPort at runtime). */
  portConflictDeps: Omit<PortConflictDeps, 'findAvailablePort'>;
  /** Factory for IPC handler deps (needs mainWindow + port at runtime). */
  ipcHandlerDeps: Omit<IpcHandlerDeps, 'getMainWindow' | 'serverPort'>;
  /** Factory for update checker deps (needs mainWindow at runtime). */
  updateCheckerDeps: Omit<UpdateCheckerDeps, 'sendToRenderer'>;
}

/** Application state (exposed for testing). */
export interface AppState {
  mainWindow: AppBrowserWindow | null;
  splashWindow: AppBrowserWindow | null;
  tray: TrayInstance | null;
  bootstrapResult: BootstrapResult | null;
  adapterResult: ElectronAdapterResult | null;
  webServerService: IWebServerService | null;
  serverPort: number;
  isQuitting: boolean;
}

/**
 * Create the splash screen window.
 * Shown immediately on app.ready while the backend bootstraps.
 */
export function createSplashWindow(
  BrowserWindow: new (opts: Record<string, unknown>) => AppBrowserWindow,
  splashHtmlPath: string
): AppBrowserWindow {
  const splash = new BrowserWindow({
    width: 400,
    height: 300,
    frame: false,
    transparent: false,
    resizable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  splash.loadFile(splashHtmlPath);
  splash.once('ready-to-show', () => splash.show());

  return splash;
}

/**
 * Create the main application window.
 * Uses electron-window-state for position/size persistence.
 */
export function createMainWindow(
  BrowserWindow: new (opts: Record<string, unknown>) => AppBrowserWindow,
  windowStateKeeper: AppDeps['windowStateKeeper'],
  port: number,
  preloadPath: string,
  state: AppState
): AppBrowserWindow {
  const windowState = windowStateKeeper({
    defaultWidth: 1280,
    defaultHeight: 800,
  });

  const win = new BrowserWindow({
    x: windowState.x,
    y: windowState.y,
    width: windowState.width,
    height: windowState.height,
    minWidth: 800,
    minHeight: 600,
    show: false,
    title: 'shep',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      preload: preloadPath,
    },
  });

  // Let electron-window-state track this window
  windowState.manage(win);

  // Load the Next.js web UI
  win.loadURL(`http://localhost:${port}`);

  // When ready, show main window and close splash
  win.once('ready-to-show', () => {
    win.show();
    if (state.splashWindow && !state.splashWindow.isDestroyed()) {
      state.splashWindow.close();
      state.splashWindow = null;
    }
  });

  // Minimize to tray on close (don't quit)
  win.on('close', (event: unknown) => {
    if (!state.isQuitting) {
      (event as { preventDefault(): void }).preventDefault();
      win.hide();
    }
  });

  return win;
}

/**
 * Run the graceful shutdown sequence.
 * Stops watchers, web server, and closes database connections.
 */
export async function gracefulShutdown(state: AppState): Promise<void> {
  console.log(`${TAG} Shutting down...`);

  const forceExit = setTimeout(() => {
    console.warn(`${TAG} Force exit after timeout`);
    process.exit(0);
  }, 5000);
  forceExit.unref();

  try {
    // Stop Electron adapter listeners (notification bus)
    if (state.adapterResult) {
      state.adapterResult.cleanup();
    }

    // Stop watchers
    if (state.bootstrapResult) {
      state.bootstrapResult.shutdown();
    }

    // Stop web server
    if (state.webServerService) {
      await state.webServerService.stop();
    }
  } finally {
    clearTimeout(forceExit);
  }
}

/**
 * Main application entry point.
 *
 * Orchestrates the full Electron startup sequence:
 * 1. Single instance lock
 * 2. Splash screen
 * 3. Bootstrap backend
 * 4. Start web server
 * 5. Create main window
 * 6. Set up system tray
 * 7. Register graceful shutdown
 */
export async function startApp(deps: AppDeps): Promise<AppState> {
  const { electron } = deps;
  const state: AppState = {
    mainWindow: null,
    splashWindow: null,
    tray: null,
    bootstrapResult: null,
    adapterResult: null,
    webServerService: null,
    serverPort: 0,
    isQuitting: false,
  };

  // Single instance lock — prevent multiple instances
  const gotLock = electron.app.requestSingleInstanceLock();
  if (!gotLock) {
    console.log(`${TAG} Another instance is running. Exiting.`);
    electron.app.quit();
    return state;
  }

  // When a second instance is launched, focus the existing window
  electron.app.on('second-instance', () => {
    if (state.mainWindow) {
      if (state.mainWindow.isMinimized()) state.mainWindow.restore();
      state.mainWindow.show();
      state.mainWindow.focus();
    }
  });

  // Set the before-quit flag so the window close handler allows through
  electron.app.on('before-quit', () => {
    state.isQuitting = true;
  });

  // On macOS, keep the app running when all windows are closed (tray mode)
  electron.app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      // On Windows/Linux, the tray keeps the app alive.
      // Don't call app.quit() — the user quits via tray menu.
    }
  });

  await electron.app.whenReady();

  console.log(`${TAG} App ready, starting bootstrap...`);

  // Step 1: Show splash screen
  state.splashWindow = createSplashWindow(electron.BrowserWindow, deps.splashHtmlPath);

  try {
    // Step 2: Bootstrap backend (DI container, settings, watchers)
    state.bootstrapResult = await bootstrapBackend(deps.bootstrapDeps);
    console.log(`${TAG} Backend bootstrapped`);

    // Step 3: Register Electron adapters via DI token replacement
    state.adapterResult = registerElectronAdapters({
      container: state.bootstrapResult.container,
      ...deps.adapterDeps,
    });
    console.log(`${TAG} Electron adapters registered`);

    // Step 4: Resolve port (with conflict detection) and start web server
    const { port, startServer } = await resolvePort({
      ...deps.portConflictDeps,
      findAvailablePort: deps.findAvailablePort,
    });
    state.serverPort = port;

    if (startServer) {
      const { dir, dev } = resolveWebDirForElectron(deps.resolveWebDirDeps);
      state.webServerService =
        state.bootstrapResult.container.resolve<IWebServerService>('IWebServerService');
      await state.webServerService.start(port, dir, dev);
      console.log(`${TAG} Web server started at http://localhost:${port} (dev: ${dev})`);
    } else {
      console.log(`${TAG} Connecting to existing server at http://localhost:${port}`);
    }

    // Step 5: Create main window
    state.mainWindow = createMainWindow(
      electron.BrowserWindow,
      deps.windowStateKeeper,
      port,
      deps.preloadPath,
      state
    );

    // Step 6: Set up IPC handlers
    setupIpcHandlers({
      ...deps.ipcHandlerDeps,
      getMainWindow: () => state.mainWindow,
      serverPort: port,
    });
    console.log(`${TAG} IPC handlers registered`);

    // Step 7: Set up system tray
    state.tray = setupTray(state.mainWindow, {
      platform: process.platform,
      resourcesDir: deps.resourcesDir,
      electron: {
        Tray: electron.Tray,
        Menu: electron.Menu,
        app: electron.app,
        nativeImage: electron.nativeImage,
      },
    });

    // Step 8: Start update checker (runs after 10s delay)
    checkForUpdates({
      ...deps.updateCheckerDeps,
      sendToRenderer: (info) => {
        if (state.mainWindow && !state.mainWindow.isDestroyed()) {
          state.mainWindow.webContents.send('shep:update-available', info);
        }
      },
    });

    // macOS: re-show window when dock icon is clicked
    electron.app.on('activate', () => {
      if (state.mainWindow) {
        state.mainWindow.show();
        state.mainWindow.focus();
      }
    });
  } catch (error) {
    console.error(`${TAG} Fatal error during startup:`, error);
    if (state.splashWindow && !state.splashWindow.isDestroyed()) {
      state.splashWindow.close();
    }
    electron.app.quit();
    return state;
  }

  // Graceful shutdown on quit
  electron.app.on('will-quit', async (event: unknown) => {
    (event as { preventDefault(): void }).preventDefault();
    await gracefulShutdown(state);
    electron.app.exit(0);
  });

  return state;
}
