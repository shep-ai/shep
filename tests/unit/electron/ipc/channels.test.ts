import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  setupIpcHandlers,
  type IpcHandlerDeps,
} from '../../../../packages/electron/src/ipc/channels.js';
import { IPC_CHANNELS } from '../../../../packages/electron/src/ipc/constants.js';

function createMockWindow() {
  return {
    minimize: vi.fn(),
    hide: vi.fn(),
  };
}

function createMockDeps(overrides: Partial<IpcHandlerDeps> = {}): IpcHandlerDeps {
  return {
    ipcMain: {
      handle: vi.fn(),
      on: vi.fn(),
    },
    getVersion: vi.fn(() => '1.2.3'),
    getMainWindow: vi.fn(() => createMockWindow()),
    serverPort: 4050,
    ...overrides,
  };
}

describe('setupIpcHandlers', () => {
  let deps: IpcHandlerDeps;

  beforeEach(() => {
    deps = createMockDeps();
  });

  it('registers a handle for shep:get-version', () => {
    setupIpcHandlers(deps);

    expect(deps.ipcMain.handle).toHaveBeenCalledWith(
      IPC_CHANNELS.GET_VERSION,
      expect.any(Function)
    );
  });

  it('shep:get-version handler returns the app version', () => {
    setupIpcHandlers(deps);

    const handleCall = vi
      .mocked(deps.ipcMain.handle)
      .mock.calls.find(([channel]) => channel === IPC_CHANNELS.GET_VERSION);
    const handler = handleCall![1];

    // Create mock event with valid origin
    const event = { senderFrame: { url: 'http://localhost:4050/' } };
    const result = handler(event);

    expect(result).toBe('1.2.3');
  });

  it('registers a listener for shep:minimize', () => {
    setupIpcHandlers(deps);

    expect(deps.ipcMain.on).toHaveBeenCalledWith(IPC_CHANNELS.MINIMIZE, expect.any(Function));
  });

  it('shep:minimize handler calls mainWindow.minimize()', () => {
    const win = createMockWindow();
    deps.getMainWindow = vi.fn(() => win);
    setupIpcHandlers(deps);

    const onCall = vi
      .mocked(deps.ipcMain.on)
      .mock.calls.find(([channel]) => channel === IPC_CHANNELS.MINIMIZE);
    const handler = onCall![1];

    const event = { senderFrame: { url: 'http://localhost:4050/' } };
    handler(event);

    expect(win.minimize).toHaveBeenCalledOnce();
  });

  it('registers a listener for shep:close', () => {
    setupIpcHandlers(deps);

    expect(deps.ipcMain.on).toHaveBeenCalledWith(IPC_CHANNELS.CLOSE, expect.any(Function));
  });

  it('shep:close handler calls mainWindow.hide()', () => {
    const win = createMockWindow();
    deps.getMainWindow = vi.fn(() => win);
    setupIpcHandlers(deps);

    const onCall = vi
      .mocked(deps.ipcMain.on)
      .mock.calls.find(([channel]) => channel === IPC_CHANNELS.CLOSE);
    const handler = onCall![1];

    const event = { senderFrame: { url: 'http://localhost:4050/' } };
    handler(event);

    expect(win.hide).toHaveBeenCalledOnce();
  });

  it('handler rejects IPC from unexpected origins', () => {
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    deps.getVersion = vi.fn(() => '1.0.0');
    setupIpcHandlers(deps);

    const handleCall = vi
      .mocked(deps.ipcMain.handle)
      .mock.calls.find(([channel]) => channel === IPC_CHANNELS.GET_VERSION);
    const handler = handleCall![1];

    // Event from a different origin
    const event = { senderFrame: { url: 'https://evil.com/' } };
    const result = handler(event);

    expect(result).toBeUndefined();
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Rejected IPC'));

    consoleSpy.mockRestore();
  });

  it('handler accepts IPC from 127.0.0.1 origin', () => {
    setupIpcHandlers(deps);

    const handleCall = vi
      .mocked(deps.ipcMain.handle)
      .mock.calls.find(([channel]) => channel === IPC_CHANNELS.GET_VERSION);
    const handler = handleCall![1];

    const event = { senderFrame: { url: 'http://127.0.0.1:4050/' } };
    const result = handler(event);

    expect(result).toBe('1.2.3');
  });

  it('does not crash when mainWindow is null', () => {
    deps.getMainWindow = vi.fn(() => null);
    setupIpcHandlers(deps);

    const onCall = vi
      .mocked(deps.ipcMain.on)
      .mock.calls.find(([channel]) => channel === IPC_CHANNELS.MINIMIZE);
    const handler = onCall![1];

    const event = { senderFrame: { url: 'http://localhost:4050/' } };
    expect(() => handler(event)).not.toThrow();
  });
});
