import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  ElectronDesktopNotifier,
  type ElectronNotificationDeps,
} from '../../../../packages/electron/src/adapters/electron-desktop-notifier.js';

function createMockDeps(
  overrides: Partial<ElectronNotificationDeps> = {}
): ElectronNotificationDeps {
  return {
    isSupported: vi.fn(() => true),
    createNotification: vi.fn(() => ({
      show: vi.fn(),
    })),
    warn: vi.fn(),
    ...overrides,
  };
}

describe('ElectronDesktopNotifier', () => {
  let deps: ElectronNotificationDeps;
  let notifier: ElectronDesktopNotifier;

  beforeEach(() => {
    deps = createMockDeps();
    notifier = new ElectronDesktopNotifier(deps);
  });

  describe('send', () => {
    it('creates and shows an Electron Notification with correct title and body', () => {
      const mockShow = vi.fn();
      deps.createNotification = vi.fn(() => ({ show: mockShow }));

      notifier.send('Test Title', 'Test Body');

      expect(deps.createNotification).toHaveBeenCalledWith({
        title: 'Test Title',
        body: 'Test Body',
      });
      expect(mockShow).toHaveBeenCalledOnce();
    });

    it('gracefully handles Notification.isSupported() === false', () => {
      deps.isSupported = vi.fn(() => false);

      notifier.send('Title', 'Body');

      expect(deps.createNotification).not.toHaveBeenCalled();
      expect(deps.warn).not.toHaveBeenCalled();
    });

    it('catches errors from createNotification and logs a warning', () => {
      deps.createNotification = vi.fn(() => {
        throw new Error('Notification creation failed');
      });

      expect(() => notifier.send('Title', 'Body')).not.toThrow();
      expect(deps.warn).toHaveBeenCalledWith(
        expect.stringContaining('Electron notification failed'),
        expect.any(Error)
      );
    });

    it('catches errors from show() and logs a warning', () => {
      deps.createNotification = vi.fn(() => ({
        show: vi.fn(() => {
          throw new Error('show failed');
        }),
      }));

      expect(() => notifier.send('Title', 'Body')).not.toThrow();
      expect(deps.warn).toHaveBeenCalled();
    });

    it('logs a warning when the OS reports the notification failed', () => {
      // Electron 42+ shows macOS notifications through UNNotification, which emits
      // `failed` for unsigned builds instead of throwing.
      const listeners = new Map<string, (...args: unknown[]) => void>();
      deps.createNotification = vi.fn(() => ({
        show: vi.fn(),
        on: vi.fn((event: string, listener: (...args: unknown[]) => void) => {
          listeners.set(event, listener);
        }),
      }));

      notifier.send('Title', 'Body');
      listeners.get('failed')?.({}, 'Notifications are not allowed for this application');

      expect(deps.warn).toHaveBeenCalledWith(
        expect.stringContaining('Electron notification failed'),
        'Notifications are not allowed for this application'
      );
    });
  });

  describe('startListening', () => {
    it('subscribes to the notification bus and calls send() on events', () => {
      const mockBus = {
        on: vi.fn(),
        removeListener: vi.fn(),
      };

      notifier.startListening(mockBus as never);

      expect(mockBus.on).toHaveBeenCalledWith('notification', expect.any(Function));

      // Simulate a notification event
      const handler = vi.mocked(mockBus.on).mock.calls[0]![1] as (event: unknown) => void;
      handler({
        eventType: 'agent_started',
        featureName: 'Test Feature',
        agentRunId: 'run-1',
        featureId: 'feat-1',
      });

      expect(deps.createNotification).toHaveBeenCalledWith({
        title: 'shep — agent_started',
        body: 'Test Feature',
      });
    });

    it('does not throw if bus listener throws', () => {
      const mockBus = {
        on: vi.fn(),
        removeListener: vi.fn(),
      };

      notifier.startListening(mockBus as never);

      // Make createNotification throw
      deps.createNotification = vi.fn(() => {
        throw new Error('boom');
      });

      const handler = vi.mocked(mockBus.on).mock.calls[0]![1] as (event: unknown) => void;
      expect(() =>
        handler({
          eventType: 'agent_started',
          featureName: 'Test',
          agentRunId: 'r',
          featureId: 'f',
        })
      ).not.toThrow();
    });
  });

  describe('stopListening', () => {
    it('removes the bus listener', () => {
      const mockBus = {
        on: vi.fn(),
        removeListener: vi.fn(),
      };

      notifier.startListening(mockBus as never);
      notifier.stopListening(mockBus as never);

      expect(mockBus.removeListener).toHaveBeenCalledWith('notification', expect.any(Function));
    });

    it('is safe to call without prior startListening', () => {
      const mockBus = {
        on: vi.fn(),
        removeListener: vi.fn(),
      };

      expect(() => notifier.stopListening(mockBus as never)).not.toThrow();
      expect(mockBus.removeListener).not.toHaveBeenCalled();
    });
  });
});
