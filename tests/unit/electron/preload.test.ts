import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createShepElectronApi, type PreloadDeps } from '../../../packages/electron/src/preload.js';
import { IPC_CHANNELS, BRIDGE_KEY } from '../../../packages/electron/src/ipc/constants.js';

function createMockDeps(): PreloadDeps {
  return {
    contextBridge: {
      exposeInMainWorld: vi.fn(),
    },
    ipcRenderer: {
      invoke: vi.fn().mockResolvedValue('1.0.0'),
      on: vi.fn(),
      send: vi.fn(),
    },
  };
}

describe('preload', () => {
  let deps: PreloadDeps;

  beforeEach(() => {
    deps = createMockDeps();
  });

  describe('createShepElectronApi', () => {
    it('returns an API object with the correct shape', () => {
      const api = createShepElectronApi(deps);

      expect(api).toHaveProperty('isElectron', true);
      expect(api).toHaveProperty('getVersion');
      expect(api).toHaveProperty('onUpdateAvailable');
      expect(api).toHaveProperty('windowControls');
      expect(api.windowControls).toHaveProperty('minimize');
      expect(api.windowControls).toHaveProperty('close');
    });

    it('getVersion() invokes the shep:get-version IPC channel', async () => {
      const api = createShepElectronApi(deps);
      await api.getVersion();

      expect(deps.ipcRenderer.invoke).toHaveBeenCalledWith(IPC_CHANNELS.GET_VERSION);
    });

    it('getVersion() returns the result from IPC', async () => {
      vi.mocked(deps.ipcRenderer.invoke).mockResolvedValue('2.3.4');
      const api = createShepElectronApi(deps);

      const version = await api.getVersion();
      expect(version).toBe('2.3.4');
    });

    it('onUpdateAvailable() registers a listener on the shep:update-available channel', () => {
      const api = createShepElectronApi(deps);
      const callback = vi.fn();

      api.onUpdateAvailable(callback);

      expect(deps.ipcRenderer.on).toHaveBeenCalledWith(
        IPC_CHANNELS.UPDATE_AVAILABLE,
        expect.any(Function)
      );
    });

    it('onUpdateAvailable callback receives version and downloadUrl', () => {
      const api = createShepElectronApi(deps);
      const callback = vi.fn();

      api.onUpdateAvailable(callback);

      // Get the registered handler and invoke it
      const registeredHandler = vi.mocked(deps.ipcRenderer.on).mock.calls[0]![1];
      registeredHandler({ version: '3.0.0', downloadUrl: 'https://example.com/download' });

      expect(callback).toHaveBeenCalledWith({
        version: '3.0.0',
        downloadUrl: 'https://example.com/download',
      });
    });

    it('windowControls.minimize() sends shep:minimize IPC', () => {
      const api = createShepElectronApi(deps);

      api.windowControls.minimize();

      expect(deps.ipcRenderer.send).toHaveBeenCalledWith(IPC_CHANNELS.MINIMIZE);
    });

    it('windowControls.close() sends shep:close IPC', () => {
      const api = createShepElectronApi(deps);

      api.windowControls.close();

      expect(deps.ipcRenderer.send).toHaveBeenCalledWith(IPC_CHANNELS.CLOSE);
    });
  });

  describe('BRIDGE_KEY', () => {
    it('is "shepElectron"', () => {
      expect(BRIDGE_KEY).toBe('shepElectron');
    });
  });
});
