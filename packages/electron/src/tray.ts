/**
 * System Tray Module
 *
 * Sets up the system tray icon with a context menu for the Electron app.
 * Supports all three platforms with appropriate icon formats:
 * - macOS: Template images (xxxTemplate.png) for proper menu bar rendering
 * - Windows: ICO format
 * - Linux: PNG format
 *
 * The tray provides:
 * - "Show Window" action: shows and focuses the main BrowserWindow
 * - "Quit" action: triggers app.quit() for graceful shutdown
 * - Double-click (Windows/Linux): shows and focuses the window
 */

import path from 'node:path';

/** Minimal Electron API surface needed by setupTray */
export interface TrayElectronApi {
  Tray: new (image: unknown) => TrayInstance;
  Menu: { buildFromTemplate(template: unknown[]): unknown };
  app: { quit(): void };
  nativeImage: { createFromPath(p: string): NativeImageInstance };
}

export interface TrayInstance {
  setContextMenu(menu: unknown): void;
  setToolTip(tooltip: string): void;
  on(event: string, listener: () => void): void;
}

export interface NativeImageInstance {
  setTemplateImage(value: boolean): void;
}

export interface WindowLike {
  show(): void;
  focus(): void;
}

export interface TrayDeps {
  platform: NodeJS.Platform;
  resourcesDir: string;
  electron: TrayElectronApi;
}

/**
 * Resolve the tray icon path based on the current platform.
 */
export function getTrayIconPath(platform: NodeJS.Platform, resourcesDir: string): string {
  switch (platform) {
    case 'darwin':
      return path.join(resourcesDir, 'trayTemplate.png');
    case 'win32':
      return path.join(resourcesDir, 'tray.ico');
    default:
      return path.join(resourcesDir, 'tray.png');
  }
}

/**
 * Set up the system tray icon with a context menu.
 *
 * @param mainWindow - The main BrowserWindow instance
 * @param deps - Dependencies including Electron APIs
 * @returns The Tray instance
 */
export function setupTray(mainWindow: WindowLike, deps: TrayDeps): TrayInstance {
  const { platform, resourcesDir, electron } = deps;

  const iconPath = getTrayIconPath(platform, resourcesDir);
  const icon = electron.nativeImage.createFromPath(iconPath);

  // On macOS, set the image as a template image for proper menu bar rendering
  if (platform === 'darwin') {
    icon.setTemplateImage(true);
  }

  const tray = new electron.Tray(icon);
  tray.setToolTip('shep');

  const contextMenu = electron.Menu.buildFromTemplate([
    {
      label: 'Show Window',
      click: () => {
        mainWindow.show();
        mainWindow.focus();
      },
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        electron.app.quit();
      },
    },
  ]);

  tray.setContextMenu(contextMenu);

  // Double-click on tray icon shows and focuses the window (Windows/Linux)
  tray.on('double-click', () => {
    mainWindow.show();
    mainWindow.focus();
  });

  return tray;
}
