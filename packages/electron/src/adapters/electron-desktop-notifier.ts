/**
 * Electron Desktop Notifier
 *
 * Implements IDesktopNotifier using Electron's native Notification API.
 * Subscribes to the NotificationEventBus to receive notification events
 * and display them as native OS notifications.
 *
 * This adapter is independent of NotificationService — it listens directly
 * to the same bus that NotificationService emits to. Zero changes to
 * existing notification code.
 *
 * Dependencies are injected for testability (Electron's Notification class
 * is not available outside the Electron runtime).
 */

import type { IDesktopNotifier } from '@shepai/core/application/ports/output/services/i-desktop-notifier.js';
import type { NotificationBus } from '@shepai/core/infrastructure/services/notifications/notification-bus.js';

interface NotificationLike {
  show(): void;
}

/** Injectable dependencies for the Electron desktop notifier. */
export interface ElectronNotificationDeps {
  /** Check if Electron notifications are supported on this platform. */
  isSupported: () => boolean;
  /** Create an Electron Notification instance. */
  createNotification: (opts: { title: string; body: string }) => NotificationLike;
  /** Log a warning message. */
  warn: (msg: string, error?: unknown) => void;
}

export class ElectronDesktopNotifier implements IDesktopNotifier {
  private deps: ElectronNotificationDeps;
  private busHandler: ((event: { eventType: string; featureName: string }) => void) | null = null;

  constructor(deps: ElectronNotificationDeps) {
    this.deps = deps;
  }

  /**
   * Send a native OS desktop notification via Electron.
   * Errors are caught and logged, never thrown.
   */
  send(title: string, body: string): void {
    if (!this.deps.isSupported()) return;

    try {
      const notification = this.deps.createNotification({ title, body });
      notification.show();
    } catch (error) {
      this.deps.warn('Electron notification failed:', error);
    }
  }

  /**
   * Subscribe to the NotificationEventBus and display native notifications
   * for incoming events.
   */
  startListening(bus: NotificationBus): void {
    this.busHandler = (event) => {
      this.send(`shep — ${event.eventType}`, event.featureName);
    };
    bus.on('notification', this.busHandler as never);
  }

  /**
   * Remove the bus listener for clean shutdown.
   */
  stopListening(bus: NotificationBus): void {
    if (this.busHandler) {
      bus.removeListener('notification', this.busHandler as never);
      this.busHandler = null;
    }
  }
}
