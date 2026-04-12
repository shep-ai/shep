import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  ElectronBrowserOpener,
  type ElectronBrowserOpenerDeps,
} from '../../../../packages/electron/src/adapters/electron-browser-opener.js';

function createMockWindow() {
  return {
    show: vi.fn(),
    focus: vi.fn(),
    loadURL: vi.fn(),
    isDestroyed: vi.fn(() => false),
  };
}

function createMockDeps(): ElectronBrowserOpenerDeps {
  return {
    getMainWindow: () => createMockWindow(),
    serverPort: 4050,
    openExternal: vi.fn(),
    warn: vi.fn(),
  };
}

describe('ElectronBrowserOpener', () => {
  let deps: ElectronBrowserOpenerDeps;
  let opener: ElectronBrowserOpener;

  beforeEach(() => {
    deps = createMockDeps();
    opener = new ElectronBrowserOpener(deps);
  });

  it('focuses BrowserWindow for localhost:port URLs', () => {
    const win = createMockWindow();
    deps.getMainWindow = () => win;

    opener.open('http://localhost:4050');

    expect(win.show).toHaveBeenCalled();
    expect(win.focus).toHaveBeenCalled();
    expect(deps.openExternal).not.toHaveBeenCalled();
  });

  it('focuses BrowserWindow for localhost:port/path URLs', () => {
    const win = createMockWindow();
    deps.getMainWindow = () => win;

    opener.open('http://localhost:4050/features/123');

    expect(win.show).toHaveBeenCalled();
    expect(win.focus).toHaveBeenCalled();
    expect(win.loadURL).toHaveBeenCalledWith('http://localhost:4050/features/123');
  });

  it('focuses BrowserWindow for 127.0.0.1:port URLs', () => {
    const win = createMockWindow();
    deps.getMainWindow = () => win;

    opener.open('http://127.0.0.1:4050/dashboard');

    expect(win.show).toHaveBeenCalled();
    expect(win.focus).toHaveBeenCalled();
  });

  it('calls openExternal for external URLs', () => {
    opener.open('https://github.com/user/repo');

    expect(deps.openExternal).toHaveBeenCalledWith('https://github.com/user/repo');
  });

  it('calls openExternal for localhost URLs on a different port', () => {
    opener.open('http://localhost:3000/something');

    expect(deps.openExternal).toHaveBeenCalledWith('http://localhost:3000/something');
  });

  it('handles destroyed window gracefully (no throw)', () => {
    const win = createMockWindow();
    win.isDestroyed = vi.fn(() => true);
    deps.getMainWindow = () => win;

    expect(() => opener.open('http://localhost:4050')).not.toThrow();
    expect(win.show).not.toHaveBeenCalled();
    expect(deps.openExternal).toHaveBeenCalledWith('http://localhost:4050');
  });

  it('handles null window gracefully', () => {
    deps.getMainWindow = () => null;

    expect(() => opener.open('http://localhost:4050')).not.toThrow();
    expect(deps.openExternal).toHaveBeenCalledWith('http://localhost:4050');
  });

  it('catches errors from openExternal and warns', () => {
    deps.openExternal = vi.fn(() => {
      throw new Error('openExternal failed');
    });

    expect(() => opener.open('https://github.com')).not.toThrow();
    expect(deps.warn).toHaveBeenCalledWith(
      expect.stringContaining('Failed to open URL'),
      expect.any(Error)
    );
  });

  it('does not navigate main window for root localhost URL', () => {
    const win = createMockWindow();
    deps.getMainWindow = () => win;

    opener.open('http://localhost:4050');

    expect(win.show).toHaveBeenCalled();
    expect(win.focus).toHaveBeenCalled();
    // Root URL — just focus, no loadURL needed
    expect(win.loadURL).not.toHaveBeenCalled();
  });
});
