/**
 * Electron Browser Opener
 *
 * Implements IBrowserOpener for the Electron context. For URLs matching the
 * app's own localhost server, focuses the existing BrowserWindow and navigates
 * to the path. For external URLs, delegates to Electron's shell.openExternal().
 *
 * Dependencies are injected for testability.
 */

import type { IBrowserOpener } from '@shepai/core/application/ports/output/services/i-browser-opener.js';

interface WindowLike {
  show(): void;
  focus(): void;
  loadURL(url: string): void;
  isDestroyed(): boolean;
}

/** Injectable dependencies for the Electron browser opener. */
export interface ElectronBrowserOpenerDeps {
  /** Get the main BrowserWindow (may be null or destroyed). */
  getMainWindow: () => WindowLike | null;
  /** The port the web server is running on. */
  serverPort: number;
  /** Open a URL in the OS default browser. */
  openExternal: (url: string) => void;
  /** Log a warning message. */
  warn: (msg: string, error?: unknown) => void;
}

export class ElectronBrowserOpener implements IBrowserOpener {
  private deps: ElectronBrowserOpenerDeps;

  constructor(deps: ElectronBrowserOpenerDeps) {
    this.deps = deps;
  }

  /**
   * Open a URL. If it matches the app's own server, focus the window.
   * Otherwise, open in the OS default browser.
   * Errors are caught and logged, never thrown.
   */
  open(url: string): void {
    try {
      if (this.isAppUrl(url)) {
        const win = this.deps.getMainWindow();
        if (win && !win.isDestroyed()) {
          win.show();
          win.focus();
          // If the URL has a path beyond root, navigate to it
          if (this.hasPath(url)) {
            win.loadURL(url);
          }
          return;
        }
        // Window unavailable — fall through to external
      }

      this.deps.openExternal(url);
    } catch (error) {
      this.deps.warn('Failed to open URL:', error);
    }
  }

  /** Check if the URL points to this app's localhost server. */
  private isAppUrl(url: string): boolean {
    try {
      const parsed = new URL(url);
      const isLocalhost = parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1';
      return isLocalhost && parseInt(parsed.port, 10) === this.deps.serverPort;
    } catch {
      return false;
    }
  }

  /** Check if the URL has a meaningful path (not just /). */
  private hasPath(url: string): boolean {
    try {
      const parsed = new URL(url);
      return parsed.pathname !== '/' && parsed.pathname !== '';
    } catch {
      return false;
    }
  }
}
