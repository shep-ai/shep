/**
 * Notification Service
 *
 * Implements INotificationService port interface. Fans out notification
 * events to enabled channels:
 * - Notification bus (for SSE → in-app toasts and browser notifications)
 * - Desktop notifier (node-notifier for OS-level notifications)
 *
 * Channel enable/disable and event type filters are read from Settings.
 */

import type {
  NotificationEvent,
  NotificationEventConfig,
} from '../../../domain/generated/output.js';
import { NotificationEventType } from '../../../domain/generated/output.js';
import type { INotificationService } from '../../../application/ports/output/services/notification-service.interface.js';
import { getSettings } from '../settings.service.js';
import type { NotificationBus } from './notification-bus.js';
import type { DesktopNotifier } from './desktop-notifier.js';

const EVENT_TYPE_TO_CONFIG_KEY: Record<NotificationEventType, keyof NotificationEventConfig> = {
  [NotificationEventType.AgentStarted]: 'agentStarted',
  [NotificationEventType.PhaseCompleted]: 'phaseCompleted',
  [NotificationEventType.WaitingApproval]: 'waitingApproval',
  [NotificationEventType.AgentCompleted]: 'agentCompleted',
  [NotificationEventType.AgentFailed]: 'agentFailed',
  [NotificationEventType.PrMerged]: 'prMerged',
  [NotificationEventType.PrClosed]: 'prClosed',
  [NotificationEventType.PrChecksPassed]: 'prChecksPassed',
  [NotificationEventType.PrChecksFailed]: 'prChecksFailed',
  [NotificationEventType.PrBlocked]: 'prBlocked',
  [NotificationEventType.MergeReviewReady]: 'mergeReviewReady',
  [NotificationEventType.CloudDeploymentUpdated]: 'cloudDeploymentUpdated',
};

export class NotificationService implements INotificationService {
  private readonly bus: NotificationBus;
  private readonly desktopNotifier: DesktopNotifier;

  constructor(bus: NotificationBus, desktopNotifier: DesktopNotifier) {
    this.bus = bus;
    this.desktopNotifier = desktopNotifier;
  }

  notify(event: NotificationEvent): void {
    const { notifications } = getSettings();

    // Check event type filter
    const configKey = EVENT_TYPE_TO_CONFIG_KEY[event.eventType];
    if (configKey && !notifications.events[configKey]) {
      return;
    }

    // Emit to bus if in-app or browser channel is enabled
    if (notifications.inApp.enabled || notifications.browser.enabled) {
      this.bus.emit('notification', event);
    }

    // Desktop notifications disabled — removed in favour of in-app toasts.
    // The DesktopNotifier dependency is kept for API compatibility but never called.
  }
}
