/**
 * Electron Main Process Entry Point
 *
 * Thin shell that wires real Electron dependencies into startApp().
 * All testable logic lives in app.ts.
 *
 * Security: nodeIntegration=false, contextIsolation=true, sandbox=true
 * Window close hides to tray. Cmd+Q / Quit triggers graceful shutdown.
 */

// IMPORTANT: reflect-metadata must be imported first for tsyringe DI
import 'reflect-metadata';

import {
  app,
  BrowserWindow,
  nativeImage,
  Tray,
  Menu,
  Notification,
  shell,
  ipcMain,
  dialog,
} from 'electron';
import path from 'node:path';
import windowStateKeeper from 'electron-window-state';
import { startApp, type AppDeps } from './app.js';
import { initializeContainer, container } from '@shepai/core/infrastructure/di/container.js';
import { initializeSettings } from '@shepai/core/infrastructure/services/settings.service.js';
import { setVersionEnvVars } from '@shepai/core/infrastructure/services/version.service.js';
import {
  initializeNotificationWatcher,
  getNotificationWatcher,
} from '@shepai/core/infrastructure/services/notifications/notification-watcher.service.js';
import {
  initializePrSyncWatcher,
  getPrSyncWatcher,
} from '@shepai/core/infrastructure/services/pr-sync/pr-sync-watcher.service.js';
import {
  initializeAutoArchiveWatcher,
  getAutoArchiveWatcher,
} from '@shepai/core/infrastructure/services/auto-archive/auto-archive-watcher.service.js';
import { getExistingConnection } from '@shepai/core/infrastructure/persistence/sqlite/connection.js';
import {
  findAvailablePort,
  isPortAvailable,
  DEFAULT_PORT,
} from '@shepai/core/infrastructure/services/port.service.js';
import { getNotificationBus } from '@shepai/core/infrastructure/services/notifications/notification-bus.js';
import { ElectronDesktopNotifier } from './adapters/electron-desktop-notifier.js';
import { ElectronBrowserOpener } from './adapters/electron-browser-opener.js';
import fs from 'node:fs';

/* eslint-disable no-console */

const deps = {
  electron: { app, BrowserWindow, Tray, Menu, nativeImage },
  windowStateKeeper,
  bootstrapDeps: {
    initializeContainer,
    container,
    initializeSettings,
    setVersionEnvVars,
    initializeNotificationWatcher,
    getNotificationWatcher,
    initializePrSyncWatcher,
    getPrSyncWatcher,
    initializeAutoArchiveWatcher,
    getAutoArchiveWatcher,
    getExistingConnection,
  },
  findAvailablePort,
  defaultPort: DEFAULT_PORT,
  resolveWebDirDeps: {
    isPackaged: app.isPackaged,
    resourcesPath: process.resourcesPath,
    existsSync: fs.existsSync,
    basedir: import.meta.dirname,
  },
  resourcesDir: path.join(import.meta.dirname, '..', 'resources'),
  splashHtmlPath: path.join(import.meta.dirname, 'splash.html'),
  preloadPath: path.join(import.meta.dirname, 'preload.js'),

  // Phase 3: Electron adapter deps
  adapterDeps: {
    createDesktopNotifier: () =>
      new ElectronDesktopNotifier({
        isSupported: () => Notification.isSupported(),
        createNotification: (opts) => new Notification(opts),
        warn: (msg, error) => console.warn(msg, error),
      }),
    createBrowserOpener: () =>
      new ElectronBrowserOpener({
        getMainWindow: () => null, // Placeholder — overridden by registerElectronAdapters
        serverPort: DEFAULT_PORT,
        openExternal: (url) => {
          shell.openExternal(url);
        },
        warn: (msg, error) => console.warn(msg, error),
      }),
    getNotificationBus,
  },

  // Phase 3: Port conflict detection deps
  portConflictDeps: {
    defaultPort: DEFAULT_PORT,
    isPortAvailable,
    showDialog: async (options: {
      type: string;
      title: string;
      message: string;
      detail: string;
      buttons: string[];
      defaultId: number;
    }) => {
      const result = await dialog.showMessageBox({
        type: options.type as 'question',
        title: options.title,
        message: options.message,
        detail: options.detail,
        buttons: options.buttons,
        defaultId: options.defaultId,
      });
      return result.response;
    },
    warn: (msg: string, error?: unknown) => console.warn(msg, error),
  },

  // Phase 3: IPC handler deps
  ipcHandlerDeps: {
    ipcMain: {
      handle: (channel: string, handler: (...args: unknown[]) => unknown) =>
        ipcMain.handle(channel, handler as Parameters<typeof ipcMain.handle>[1]),
      on: (channel: string, handler: (...args: unknown[]) => void) =>
        ipcMain.on(channel, handler as Parameters<typeof ipcMain.on>[1]),
    },
    getVersion: () => app.getVersion(),
  },

  // Phase 3: Update checker deps
  updateCheckerDeps: {
    currentVersion: app.getVersion(),
    repoOwner: 'shepai',
    repoName: 'cli',
    fetch: (url: string) => globalThis.fetch(url),
    warn: (msg: string, error?: unknown) => console.warn(msg, error),
  },
};

startApp(deps as AppDeps).catch((error) => {
  console.error('[electron] Unhandled error:', error);
  process.exit(1);
});
