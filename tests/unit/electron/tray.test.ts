import { describe, it, expect, vi, beforeEach } from 'vitest';
import path from 'node:path';
import {
  setupTray,
  getTrayIconPath,
  type TrayDeps,
  type TrayElectronApi,
  type WindowLike,
} from '../../../packages/electron/src/tray.js';

function createMockElectronApi(): TrayElectronApi {
  const mockSetTemplateImage = vi.fn();

  // Use a class so `new electron.Tray(icon)` works
  class MockTray {
    setContextMenu = vi.fn();
    setToolTip = vi.fn();
    on = vi.fn();
  }

  return {
    Tray: MockTray as unknown as TrayElectronApi['Tray'],
    Menu: {
      buildFromTemplate: vi.fn((template: unknown[]) => ({ items: template })),
    },
    app: {
      quit: vi.fn(),
    },
    nativeImage: {
      createFromPath: vi.fn(() => ({
        setTemplateImage: mockSetTemplateImage,
      })),
    },
  };
}

function createMockWindow(): WindowLike {
  return { show: vi.fn(), focus: vi.fn() };
}

function createDeps(platform: NodeJS.Platform = 'darwin', electron?: TrayElectronApi): TrayDeps {
  return {
    platform,
    resourcesDir: '/resources',
    electron: electron ?? createMockElectronApi(),
  };
}

describe('getTrayIconPath', () => {
  it('returns trayTemplate.png for macOS', () => {
    expect(getTrayIconPath('darwin', '/res')).toBe(path.join('/res', 'trayTemplate.png'));
  });

  it('returns tray.ico for Windows', () => {
    expect(getTrayIconPath('win32', '/res')).toBe(path.join('/res', 'tray.ico'));
  });

  it('returns tray.png for Linux', () => {
    expect(getTrayIconPath('linux', '/res')).toBe(path.join('/res', 'tray.png'));
  });

  it('returns tray.png for unknown platforms', () => {
    expect(getTrayIconPath('freebsd' as NodeJS.Platform, '/res')).toBe(
      path.join('/res', 'tray.png')
    );
  });
});

describe('setupTray', () => {
  let mockWindow: WindowLike;
  let mockElectron: TrayElectronApi;

  beforeEach(() => {
    mockWindow = createMockWindow();
    mockElectron = createMockElectronApi();
  });

  function callSetupTray(platform: NodeJS.Platform = 'darwin') {
    return setupTray(mockWindow, createDeps(platform, mockElectron));
  }

  it('returns a Tray instance', () => {
    const tray = callSetupTray();
    expect(tray).toBeDefined();
    expect(tray.setToolTip).toBeTypeOf('function');
  });

  it('sets tooltip to "shep"', () => {
    const tray = callSetupTray();
    expect(tray.setToolTip).toHaveBeenCalledWith('shep');
  });

  it('creates context menu with Show Window and Quit actions', () => {
    callSetupTray();
    const buildFromTemplate = vi.mocked(mockElectron.Menu.buildFromTemplate);
    expect(buildFromTemplate).toHaveBeenCalled();
    const template = buildFromTemplate.mock.calls[0]![0] as {
      label?: string;
      type?: string;
    }[];
    const labels = template.map((item) => item.label ?? item.type);
    expect(labels).toContain('Show Window');
    expect(labels).toContain('Quit');
  });

  it('Show Window action calls mainWindow.show() and mainWindow.focus()', () => {
    callSetupTray();
    const template = vi.mocked(mockElectron.Menu.buildFromTemplate).mock.calls[0]![0] as {
      label?: string;
      click?: () => void;
    }[];
    const showItem = template.find((item) => item.label === 'Show Window');
    showItem!.click!();
    expect(mockWindow.show).toHaveBeenCalled();
    expect(mockWindow.focus).toHaveBeenCalled();
  });

  it('Quit action calls app.quit()', () => {
    callSetupTray();
    const template = vi.mocked(mockElectron.Menu.buildFromTemplate).mock.calls[0]![0] as {
      label?: string;
      click?: () => void;
    }[];
    const quitItem = template.find((item) => item.label === 'Quit');
    quitItem!.click!();
    expect(mockElectron.app.quit).toHaveBeenCalled();
  });

  it('registers double-click handler', () => {
    const tray = callSetupTray();
    expect(tray.on).toHaveBeenCalledWith('double-click', expect.any(Function));
  });

  it('double-click handler shows and focuses the window', () => {
    const tray = callSetupTray();
    const trayOn = vi.mocked(tray.on);
    const handler = trayOn.mock.calls.find(
      ([event, _listener]: [string, () => void]) => event === 'double-click'
    )?.[1] as (() => void) | undefined;
    expect(handler).toBeDefined();
    handler!();
    expect(mockWindow.show).toHaveBeenCalled();
    expect(mockWindow.focus).toHaveBeenCalled();
  });

  describe('platform-specific icons', () => {
    it('uses trayTemplate.png on macOS', () => {
      callSetupTray('darwin');
      expect(mockElectron.nativeImage.createFromPath).toHaveBeenCalledWith(
        path.join('/resources', 'trayTemplate.png')
      );
    });

    it('sets template image on macOS', () => {
      callSetupTray('darwin');
      const icon = vi.mocked(mockElectron.nativeImage.createFromPath).mock.results[0]!.value;
      expect(icon.setTemplateImage).toHaveBeenCalledWith(true);
    });

    it('uses tray.ico on Windows', () => {
      callSetupTray('win32');
      expect(mockElectron.nativeImage.createFromPath).toHaveBeenCalledWith(
        path.join('/resources', 'tray.ico')
      );
    });

    it('does not set template image on Windows', () => {
      callSetupTray('win32');
      const icon = vi.mocked(mockElectron.nativeImage.createFromPath).mock.results[0]!.value;
      expect(icon.setTemplateImage).not.toHaveBeenCalled();
    });

    it('uses tray.png on Linux', () => {
      callSetupTray('linux');
      expect(mockElectron.nativeImage.createFromPath).toHaveBeenCalledWith(
        path.join('/resources', 'tray.png')
      );
    });

    it('does not set template image on Linux', () => {
      callSetupTray('linux');
      const icon = vi.mocked(mockElectron.nativeImage.createFromPath).mock.results[0]!.value;
      expect(icon.setTemplateImage).not.toHaveBeenCalled();
    });
  });
});
