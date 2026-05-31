/**
 * NotificationService Unit Tests
 *
 * Tests for the notification service that fans out events to
 * enabled channels (notification bus for SSE/in-app/browser,
 * desktop notifier for OS notifications), respecting Settings
 * preferences.
 */

import 'reflect-metadata';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { NotificationEvent, NotificationPreferences } from '@/domain/generated/output.js';
import { NotificationEventType, NotificationSeverity } from '@/domain/generated/output.js';
import {
  getNotificationBus,
  resetNotificationBus,
} from '@/infrastructure/services/notifications/notification-bus.js';
import { initializeSettings, resetSettings } from '@/infrastructure/services/settings.service.js';
import { createDefaultSettings } from '@/domain/factories/settings-defaults.factory.js';
import { NotificationService } from '@/infrastructure/services/notifications/notification.service.js';
import type { DesktopNotifier } from '@/infrastructure/services/notifications/desktop-notifier.js';

function createTestEvent(overrides?: Partial<NotificationEvent>): NotificationEvent {
  return {
    eventType: NotificationEventType.AgentCompleted,
    agentRunId: 'run-123',
    featureId: 'feat-456',
    featureName: 'Test Feature',
    message: 'Agent completed successfully',
    severity: NotificationSeverity.Success,
    timestamp: new Date().toISOString(),
    ...overrides,
  };
}

function createMockDesktopNotifier(): DesktopNotifier {
  return {
    send: vi.fn(),
  } as unknown as DesktopNotifier;
}

function initSettingsWithNotifications(overrides: Partial<NotificationPreferences> = {}): void {
  const settings = createDefaultSettings();
  settings.notifications = {
    ...settings.notifications,
    ...overrides,
  };
  initializeSettings(settings);
}

describe('NotificationService', () => {
  let desktopNotifier: DesktopNotifier;
  let service: NotificationService;
  let busEvents: NotificationEvent[];

  beforeEach(() => {
    resetNotificationBus();
    resetSettings();

    busEvents = [];
    const bus = getNotificationBus();
    bus.on('notification', (event) => busEvents.push(event));

    desktopNotifier = createMockDesktopNotifier();
  });

  describe('notify', () => {
    it('should emit to bus when inApp channel is enabled', () => {
      initSettingsWithNotifications({ inApp: { enabled: true } });
      service = new NotificationService(getNotificationBus(), desktopNotifier);

      const event = createTestEvent();
      service.notify(event);

      expect(busEvents).toHaveLength(1);
      expect(busEvents[0]).toEqual(event);
    });

    it('should emit to bus when browser channel is enabled', () => {
      initSettingsWithNotifications({ browser: { enabled: true } });
      service = new NotificationService(getNotificationBus(), desktopNotifier);

      const event = createTestEvent();
      service.notify(event);

      expect(busEvents).toHaveLength(1);
      expect(busEvents[0]).toEqual(event);
    });

    it('should never call DesktopNotifier.send() (desktop notifications removed)', () => {
      initSettingsWithNotifications({ desktop: { enabled: true } });
      service = new NotificationService(getNotificationBus(), desktopNotifier);

      service.notify(createTestEvent());

      expect(desktopNotifier.send).not.toHaveBeenCalled();
    });

    it('should skip bus emission when both inApp and browser are disabled', () => {
      initSettingsWithNotifications({
        inApp: { enabled: false },
        browser: { enabled: false },
      });
      service = new NotificationService(getNotificationBus(), desktopNotifier);

      service.notify(createTestEvent());

      expect(busEvents).toHaveLength(0);
    });

    it('should skip event when event type filter is false', () => {
      initSettingsWithNotifications({
        inApp: { enabled: true },
        desktop: { enabled: true },
        events: {
          agentStarted: true,
          phaseCompleted: true,
          waitingApproval: true,
          agentCompleted: false, // disabled
          agentFailed: true,
          prMerged: true,
          prClosed: true,
          prChecksPassed: true,
          prChecksFailed: true,
          prBlocked: true,
          mergeReviewReady: true,
        },
      });
      service = new NotificationService(getNotificationBus(), desktopNotifier);

      service.notify(createTestEvent({ eventType: NotificationEventType.AgentCompleted }));

      expect(busEvents).toHaveLength(0);
      expect(desktopNotifier.send).not.toHaveBeenCalled();
    });

    it('should dispatch when event type filter is true', () => {
      initSettingsWithNotifications({
        inApp: { enabled: true },
        desktop: { enabled: true },
        events: {
          agentStarted: true,
          phaseCompleted: true,
          waitingApproval: true,
          agentCompleted: true,
          agentFailed: true,
          prMerged: true,
          prClosed: true,
          prChecksPassed: true,
          prChecksFailed: true,
          prBlocked: true,
          mergeReviewReady: true,
        },
      });
      service = new NotificationService(getNotificationBus(), desktopNotifier);

      service.notify(
        createTestEvent({
          eventType: NotificationEventType.AgentFailed,
          severity: NotificationSeverity.Error,
        })
      );

      expect(busEvents).toHaveLength(1);
      expect(desktopNotifier.send).not.toHaveBeenCalled();
    });

    it('should emit to bus but not desktop when all channels are enabled', () => {
      initSettingsWithNotifications({
        inApp: { enabled: true },
        browser: { enabled: true },
        desktop: { enabled: true },
      });
      service = new NotificationService(getNotificationBus(), desktopNotifier);

      const event = createTestEvent();
      service.notify(event);

      expect(busEvents).toHaveLength(1);
      expect(desktopNotifier.send).not.toHaveBeenCalled();
    });
  });

  describe('whatsapp channel (spec 101)', () => {
    it('forwards the event to the optional WhatsApp notifier', () => {
      initSettingsWithNotifications({ inApp: { enabled: true } });
      const whatsAppNotifier = { notify: vi.fn() };
      service = new NotificationService(getNotificationBus(), desktopNotifier, whatsAppNotifier);

      const event = createTestEvent();
      service.notify(event);

      expect(whatsAppNotifier.notify).toHaveBeenCalledWith(event);
    });

    it('does not forward an event filtered out by user preferences', () => {
      // Disable agentCompleted; the WhatsApp channel must respect the same filter.
      initSettingsWithNotifications({
        inApp: { enabled: true },
        events: {
          ...createDefaultSettings().notifications.events,
          agentCompleted: false,
        },
      });
      const whatsAppNotifier = { notify: vi.fn() };
      service = new NotificationService(getNotificationBus(), desktopNotifier, whatsAppNotifier);

      service.notify(createTestEvent({ eventType: NotificationEventType.AgentCompleted }));

      expect(whatsAppNotifier.notify).not.toHaveBeenCalled();
    });

    it('works without a WhatsApp notifier (optional dependency)', () => {
      initSettingsWithNotifications({ inApp: { enabled: true } });
      service = new NotificationService(getNotificationBus(), desktopNotifier);
      expect(() => service.notify(createTestEvent())).not.toThrow();
    });
  });
});
