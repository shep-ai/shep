/**
 * Messaging Notification Emitter Unit Tests
 *
 * Tests for the notification emitter that subscribes to the
 * NotificationEventBus and forwards events through the tunnel
 * with debouncing.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import { MessagingNotificationEmitter } from '@/infrastructure/services/messaging/notification-emitter.js';
import type { NotificationEvent } from '@/domain/generated/output.js';
import { NotificationEventType, NotificationSeverity } from '@/domain/generated/output.js';
import type { IMessageSender } from '@/application/ports/output/services/message-sender.interface.js';
import type {
  NotificationBus,
  NotificationEventMap,
} from '@/infrastructure/services/notifications/notification-bus.js';

function createTestEvent(overrides: Partial<NotificationEvent> = {}): NotificationEvent {
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

describe('MessagingNotificationEmitter', () => {
  let emitter: MessagingNotificationEmitter;
  let mockSender: { send: ReturnType<typeof vi.fn> };
  let bus: NotificationBus;

  beforeEach(() => {
    vi.useFakeTimers();

    mockSender = {
      send: vi.fn().mockResolvedValue(undefined),
    };

    bus = new EventEmitter<NotificationEventMap>();

    emitter = new MessagingNotificationEmitter(
      mockSender as unknown as IMessageSender,
      bus,
      100 // short debounce for testing
    );
  });

  afterEach(() => {
    emitter.stop();
    vi.useRealTimers();
  });

  it('should not forward events before start()', () => {
    bus.emit('notification', createTestEvent());
    vi.advanceTimersByTime(200);
    expect(mockSender.send).not.toHaveBeenCalled();
  });

  it('should forward events after start() with debouncing', () => {
    emitter.start();

    bus.emit('notification', createTestEvent());
    expect(mockSender.send).not.toHaveBeenCalled();

    vi.advanceTimersByTime(100);
    expect(mockSender.send).toHaveBeenCalledTimes(1);
  });

  it('should debounce multiple events for the same feature+type', () => {
    emitter.start();

    bus.emit('notification', createTestEvent({ message: 'first' }));
    vi.advanceTimersByTime(50);
    bus.emit('notification', createTestEvent({ message: 'second' }));
    vi.advanceTimersByTime(50);
    bus.emit('notification', createTestEvent({ message: 'third' }));

    vi.advanceTimersByTime(100);
    expect(mockSender.send).toHaveBeenCalledTimes(1);
    expect(mockSender.send).toHaveBeenCalledWith(expect.objectContaining({ message: 'third' }));
  });

  it('should NOT debounce waiting_approval events', () => {
    emitter.start();

    bus.emit('notification', createTestEvent({ eventType: NotificationEventType.WaitingApproval }));

    // Should be sent immediately, no debounce
    expect(mockSender.send).toHaveBeenCalledTimes(1);
  });

  it('should not debounce events for different features', () => {
    emitter.start();

    bus.emit('notification', createTestEvent({ featureId: 'feat-1' }));
    bus.emit('notification', createTestEvent({ featureId: 'feat-2' }));

    vi.advanceTimersByTime(100);
    expect(mockSender.send).toHaveBeenCalledTimes(2);
  });

  it('should stop forwarding after stop()', () => {
    emitter.start();
    emitter.stop();

    bus.emit('notification', createTestEvent());
    vi.advanceTimersByTime(200);
    expect(mockSender.send).not.toHaveBeenCalled();
  });

  it('should sanitize messages before forwarding', () => {
    emitter.start();

    bus.emit(
      'notification',
      createTestEvent({ message: 'Error at /Users/john/projects/app/src/index.ts' })
    );

    vi.advanceTimersByTime(100);
    expect(mockSender.send).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Error at [path]' })
    );
  });
});
