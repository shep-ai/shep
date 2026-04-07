/**
 * Browser Opener Interface
 *
 * Output port for opening URLs in the user's default browser.
 * Infrastructure layer provides concrete implementations:
 * - BrowserOpenerService — default, uses platform-specific commands (open, xdg-open, cmd start)
 * - ElectronBrowserOpener — used when running inside Electron (focuses BrowserWindow or shell.openExternal)
 *
 * Following Clean Architecture:
 * - Application layer depends on this interface
 * - Infrastructure layer provides concrete implementations
 */

/**
 * Port interface for opening URLs in the user's browser or app window.
 *
 * Implementations must:
 * - Handle errors gracefully (log, never throw)
 * - Degrade gracefully in non-interactive environments (CI, piped I/O)
 */
export interface IBrowserOpener {
  /**
   * Open a URL in the user's default browser or application window.
   *
   * @param url - The URL to open
   */
  open(url: string): void;
}
