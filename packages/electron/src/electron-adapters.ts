/**
 * Electron Adapter Registration
 *
 * Registers Electron-specific adapter implementations in the DI container
 * via post-initialization token replacement. Called after bootstrapBackend()
 * completes, before the web server starts.
 *
 * tsyringe's container.register() naturally replaces previous registrations
 * for the same token — this is the same pattern used in container.ts for
 * conditional mock executor registration.
 */

import type { DependencyContainer } from 'tsyringe';
import type { ElectronDesktopNotifier } from './adapters/electron-desktop-notifier.js';
import type { ElectronBrowserOpener } from './adapters/electron-browser-opener.js';
import type { NotificationBus } from '@shepai/core/infrastructure/services/notifications/notification-bus.js';

/** Injectable dependencies for adapter registration. */
export interface ElectronAdapterDeps {
  container: DependencyContainer;
  createDesktopNotifier: () => ElectronDesktopNotifier;
  createBrowserOpener: () => ElectronBrowserOpener;
  getNotificationBus: () => NotificationBus;
}

export interface ElectronAdapterResult {
  notifier: ElectronDesktopNotifier;
  opener: ElectronBrowserOpener;
  cleanup: () => void;
}

/**
 * Register Electron-specific adapters in the DI container and start listeners.
 *
 * Override tokens:
 * - 'DesktopNotifier' → ElectronDesktopNotifier
 * - 'IBrowserOpener' → ElectronBrowserOpener
 *
 * Returns a cleanup function for graceful shutdown.
 */
export function registerElectronAdapters(deps: ElectronAdapterDeps): ElectronAdapterResult {
  const notifier = deps.createDesktopNotifier();
  const opener = deps.createBrowserOpener();
  const bus = deps.getNotificationBus();

  // Override DI tokens with Electron adapters
  deps.container.register('DesktopNotifier', { useFactory: () => notifier });
  deps.container.register('IBrowserOpener', { useFactory: () => opener });

  // Start listening to notification bus for native OS notifications
  notifier.startListening(bus);

  return {
    notifier,
    opener,
    cleanup: () => {
      notifier.stopListening(bus);
    },
  };
}
