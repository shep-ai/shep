/**
 * Electron Preload Script
 *
 * Runs in the renderer process with contextIsolation=true and sandbox=true.
 * Exposes a minimal 'shepElectron' API via contextBridge for the web UI to
 * communicate with the main process.
 *
 * Security: NO Node.js APIs are exposed. Only typed IPC channels are bridged.
 *
 * The testable logic is in createShepElectronApi() — the actual Electron
 * imports and exposeInMainWorld call happen at module scope (only in Electron).
 */

import type * as ElectronMod from 'electron';
import { IPC_CHANNELS, BRIDGE_KEY } from './ipc/constants.js';

/** Update info sent from main process to renderer. */
export interface UpdateInfo {
  version: string;
  downloadUrl: string;
}

/** The API shape exposed to the renderer via window.shepElectron. */
export interface ShepElectronApi {
  isElectron: true;
  getVersion: () => Promise<string>;
  onUpdateAvailable: (callback: (info: UpdateInfo) => void) => void;
  windowControls: {
    minimize: () => void;
    maximizeToggle: () => void;
    close: () => void;
    /** Subscribe to maximize-state changes. Fires for both IPC-driven toggles
     *  and OS gestures (double-click title, Win+Up, macOS green button). */
    onMaximizedChange: (callback: (isMaximized: boolean) => void) => void;
  };
}

/** Injectable dependencies for the preload script. */
export interface PreloadDeps {
  contextBridge: {
    exposeInMainWorld: (key: string, api: unknown) => void;
  };
  ipcRenderer: {
    invoke: (channel: string) => Promise<unknown>;
    on: (channel: string, listener: (data: unknown) => void) => void;
    send: (channel: string) => void;
  };
}

/**
 * Create the shepElectron API object.
 * Extracted for testability — does not call exposeInMainWorld.
 */
export function createShepElectronApi(deps: PreloadDeps): ShepElectronApi {
  return {
    isElectron: true,

    getVersion: () => deps.ipcRenderer.invoke(IPC_CHANNELS.GET_VERSION) as Promise<string>,

    onUpdateAvailable: (callback: (info: UpdateInfo) => void) => {
      deps.ipcRenderer.on(IPC_CHANNELS.UPDATE_AVAILABLE, (data) => {
        callback(data as UpdateInfo);
      });
    },

    windowControls: {
      minimize: () => deps.ipcRenderer.send(IPC_CHANNELS.MINIMIZE),
      maximizeToggle: () => deps.ipcRenderer.send(IPC_CHANNELS.MAXIMIZE_TOGGLE),
      close: () => deps.ipcRenderer.send(IPC_CHANNELS.CLOSE),
      onMaximizedChange: (callback) => {
        deps.ipcRenderer.on(IPC_CHANNELS.WINDOW_MAXIMIZED_CHANGED, (data) => {
          callback(Boolean(data));
        });
      },
    },
  };
}

// When running in Electron, wire the real contextBridge and ipcRenderer.
// This code only executes in the actual Electron preload context.
//
// Using a synchronous `require('electron')` — esbuild emits this preload
// as CJS (see build.mjs) so the renderer sees the API attached during
// document_start, before React mounts and calls readWindowControls().
// The original `await import('electron')` pattern silently failed for
// preloads loaded under certain sandbox / frameless configs because
// top-level await races the contextBridge attach with first paint.
/* eslint-disable @typescript-eslint/no-require-imports */
try {
  // `electron` is only resolvable inside the Electron renderer's preload
  // context; the require call throws in Node-mode tests, and the catch
  // keeps test environments happy.
  const electronModule = require('electron') as typeof ElectronMod;
  const { contextBridge, ipcRenderer } = electronModule;

  const api = createShepElectronApi({
    contextBridge,
    ipcRenderer: {
      invoke: (channel) => ipcRenderer.invoke(channel),
      on: (channel, listener) => {
        ipcRenderer.on(channel, (_event, data) => listener(data));
      },
      send: (channel) => ipcRenderer.send(channel),
    },
  });

  contextBridge.exposeInMainWorld(BRIDGE_KEY, api);
} catch {
  // Not running in Electron (e.g., tests) — skip
}
/* eslint-enable @typescript-eslint/no-require-imports */
