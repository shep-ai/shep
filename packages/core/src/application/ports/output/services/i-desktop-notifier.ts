/**
 * Desktop Notifier Interface
 *
 * Output port for sending native OS desktop notifications.
 * Infrastructure layer provides concrete implementations:
 * - DesktopNotifier (node-notifier) — default for CLI/web contexts
 * - ElectronDesktopNotifier — used when running inside Electron
 *
 * Following Clean Architecture:
 * - Application layer depends on this interface
 * - Infrastructure layer provides concrete implementations
 */

/**
 * Port interface for sending native OS desktop notifications.
 *
 * Implementations must:
 * - Sanitize input to prevent injection (shell metacharacters, length limits)
 * - Handle errors gracefully (log, never throw)
 */
export interface IDesktopNotifier {
  /**
   * Send a native OS desktop notification.
   *
   * @param title - Notification title
   * @param body - Notification body text
   */
  send(title: string, body: string): void;
}
