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
    close: () => void;
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
      close: () => deps.ipcRenderer.send(IPC_CHANNELS.CLOSE),
    },
  };
}

// When running in Electron, wire the real contextBridge and ipcRenderer.
// This code only executes in the actual Electron preload context.
try {
  // Dynamic import to avoid errors when testing outside Electron
  const { contextBridge, ipcRenderer } = await import('electron');

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
