/**
 * IPC Channel Constants
 *
 * Shared between preload.ts and main process IPC handlers.
 * All channels use a 'shep:' prefix to avoid collisions.
 */

export const IPC_CHANNELS = {
  GET_VERSION: 'shep:get-version',
  UPDATE_AVAILABLE: 'shep:update-available',
  MINIMIZE: 'shep:minimize',
  CLOSE: 'shep:close',
} as const;

/** The key used for contextBridge.exposeInMainWorld(). */
export const BRIDGE_KEY = 'shepElectron';
