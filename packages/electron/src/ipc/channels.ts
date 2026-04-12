/**
 * IPC Channel Handlers
 *
 * Registers ipcMain handlers for all channels defined in the preload script.
 * All handlers validate the sender's origin matches the expected localhost URL.
 *
 * Security: Every handler checks that the IPC came from the expected origin
 * (localhost on the server port) before processing. This prevents malicious
 * renderer frames from invoking main-process APIs.
 */

import { IPC_CHANNELS } from './constants.js';

/* eslint-disable no-console */

interface WindowLike {
  minimize(): void;
  hide(): void;
}

interface IpcEvent {
  senderFrame: { url: string };
}

/** Injectable dependencies for IPC channel setup. */
export interface IpcHandlerDeps {
  ipcMain: {
    handle: (channel: string, handler: (event: IpcEvent) => unknown) => void;
    on: (channel: string, handler: (event: IpcEvent) => void) => void;
  };
  getVersion: () => string;
  getMainWindow: () => WindowLike | null;
  serverPort: number;
}

/**
 * Validate that an IPC event came from the expected localhost origin.
 */
function isValidOrigin(event: IpcEvent, serverPort: number): boolean {
  try {
    const url = new URL(event.senderFrame.url);
    const isLocalhost = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
    return isLocalhost && parseInt(url.port, 10) === serverPort;
  } catch {
    return false;
  }
}

/**
 * Register all IPC handlers for the preload bridge.
 * Called once from main.ts after creating the BrowserWindow.
 */
export function setupIpcHandlers(deps: IpcHandlerDeps): void {
  const { ipcMain, getVersion, getMainWindow, serverPort } = deps;

  // shep:get-version — returns the app version string
  ipcMain.handle(IPC_CHANNELS.GET_VERSION, (event) => {
    if (!isValidOrigin(event, serverPort)) {
      console.warn(`Rejected IPC on ${IPC_CHANNELS.GET_VERSION} from ${event.senderFrame.url}`);
      return undefined;
    }
    return getVersion();
  });

  // shep:minimize — minimize the main window
  ipcMain.on(IPC_CHANNELS.MINIMIZE, (event) => {
    if (!isValidOrigin(event, serverPort)) {
      console.warn(`Rejected IPC on ${IPC_CHANNELS.MINIMIZE} from ${event.senderFrame.url}`);
      return;
    }
    getMainWindow()?.minimize();
  });

  // shep:close — hide the main window (minimize to tray)
  ipcMain.on(IPC_CHANNELS.CLOSE, (event) => {
    if (!isValidOrigin(event, serverPort)) {
      console.warn(`Rejected IPC on ${IPC_CHANNELS.CLOSE} from ${event.senderFrame.url}`);
      return;
    }
    getMainWindow()?.hide();
  });
}
