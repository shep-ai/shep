/**
 * Messaging Notification Emitter
 *
 * Subscribes to Shep's existing NotificationEventBus and pushes
 * events through the Gateway tunnel for delivery to messaging apps.
 *
 * Features:
 * - Debouncing: events for the same feature+type are collapsed within
 *   a configurable window (default 5s) to avoid flooding
 * - Content sanitization: all messages are scrubbed of paths, code, and secrets
 * - Gate events are never debounced — delivered immediately
 */

import type { NotificationEvent, MessagingNotification } from '../../../domain/generated/output.js';
import type { NotificationBus } from '../notifications/notification-bus.js';
import { sanitizeForMessaging } from './content-sanitizer.js';
import type { IMessageSender } from '../../../application/ports/output/services/message-sender.interface.js';

const DEFAULT_DEBOUNCE_MS = 5_000;

/**
 * Subscribes to the notification event bus and forwards events
 * to the messaging tunnel for delivery to the user's phone.
 */
export class MessagingNotificationEmitter {
  private debounceTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private listening = false;
  private handler: ((event: NotificationEvent) => void) | null = null;

  constructor(
    private readonly sender: IMessageSender,
    private readonly notificationBus: NotificationBus,
    private readonly debounceMs: number = DEFAULT_DEBOUNCE_MS
  ) {}

  /** Start listening for notification events */
  start(): void {
    if (this.listening) return;

    this.handler = (event: NotificationEvent) => {
      const notification: MessagingNotification = {
        event: event.eventType,
        featureId: event.featureId,
        title: event.featureName,
        message: sanitizeForMessaging(event.message),
      };

      // Gate/approval events are always delivered immediately
      if (event.eventType === 'waiting_approval') {
        void this.sender.send(notification);
        return;
      }

      this.emitDebounced(event.featureId, event.eventType, notification);
    };

    this.notificationBus.on('notification', this.handler);
    this.listening = true;
  }

  /** Stop listening for notification events */
  stop(): void {
    if (!this.listening) return;

    if (this.handler) {
      this.notificationBus.off('notification', this.handler);
      this.handler = null;
    }

    // Clear all pending debounce timers
    for (const timer of this.debounceTimers.values()) {
      clearTimeout(timer);
    }
    this.debounceTimers.clear();
    this.listening = false;
  }

  private emitDebounced(
    featureId: string,
    eventType: string,
    notification: MessagingNotification
  ): void {
    const key = `${featureId}:${eventType}`;
    const existing = this.debounceTimers.get(key);
    if (existing) clearTimeout(existing);

    const timer = setTimeout(() => {
      void this.sender.send(notification);
      this.debounceTimers.delete(key);
    }, this.debounceMs);

    timer.unref();
    this.debounceTimers.set(key, timer);
  }
}
