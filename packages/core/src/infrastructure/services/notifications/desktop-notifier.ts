/**
 * Desktop Notifier
 *
 * Wraps node-notifier to send native OS desktop notifications
 * (macOS Notification Center, Linux libnotify, Windows toast).
 *
 * All inputs are sanitized before passing to node-notifier:
 * - Shell metacharacters are stripped (defense in depth)
 * - Title truncated to 100 chars, body to 500 chars
 * - Errors are caught and logged (never thrown)
 */

import notifier from 'node-notifier';
import type { IDesktopNotifier } from '../../../application/ports/output/services/i-desktop-notifier.js';

const SHELL_METACHAR_REGEX = /[`$|;&()<>]/g;
const MAX_TITLE_LENGTH = 100;
const MAX_BODY_LENGTH = 500;

export class DesktopNotifier implements IDesktopNotifier {
  /**
   * Send a native OS desktop notification.
   *
   * @param title - Notification title (sanitized and truncated)
   * @param body - Notification body text (sanitized and truncated)
   */
  send(title: string, body: string): void {
    try {
      notifier.notify({
        title: this.sanitize(title, MAX_TITLE_LENGTH),
        message: this.sanitize(body, MAX_BODY_LENGTH),
      });
    } catch (error) {
      // eslint-disable-next-line no-console
      console.warn('Desktop notification failed:', error);
    }
  }

  private sanitize(input: string, maxLength: number): string {
    const cleaned = input.replace(SHELL_METACHAR_REGEX, '');
    return cleaned.slice(0, maxLength);
  }
}
