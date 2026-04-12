/**
 * Desktop Notifier Unit Tests
 *
 * Tests for the node-notifier wrapper that sanitizes inputs
 * and handles errors gracefully.
 */

import 'reflect-metadata';
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('node-notifier', () => ({
  default: {
    notify: vi.fn(),
  },
}));

import notifier from 'node-notifier';
import { DesktopNotifier } from '@/infrastructure/services/notifications/desktop-notifier.js';
import type { IDesktopNotifier } from '@/application/ports/output/services/i-desktop-notifier.js';

const mockNotify = vi.mocked(notifier.notify);

describe('DesktopNotifier', () => {
  it('should be assignable to IDesktopNotifier', () => {
    const notif: IDesktopNotifier = new DesktopNotifier();
    expect(notif.send).toBeTypeOf('function');
  });

  let desktopNotifier: DesktopNotifier;

  beforeEach(() => {
    vi.clearAllMocks();
    desktopNotifier = new DesktopNotifier();
  });

  describe('send', () => {
    it('should call node-notifier.notify with title and message', () => {
      desktopNotifier.send('Agent Completed', 'Feature "Login" completed successfully');

      expect(mockNotify).toHaveBeenCalledOnce();
      expect(mockNotify).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Agent Completed',
          message: 'Feature "Login" completed successfully',
        })
      );
    });

    it('should strip shell metacharacters from title', () => {
      desktopNotifier.send('Agent `$(whoami)` Done', 'body');

      expect(mockNotify).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Agent whoami Done',
        })
      );
    });

    it('should strip shell metacharacters from body', () => {
      desktopNotifier.send(
        'title',
        'Result: $(cat /etc/passwd) | grep root; rm -rf / & echo <script>'
      );

      expect(mockNotify).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Result: cat /etc/passwd  grep root rm -rf /  echo script',
        })
      );
    });

    it('should strip all dangerous metacharacters: backtick $ | ; & ( ) < >', () => {
      const dangerousInput = '`$|;&()<>';
      desktopNotifier.send(dangerousInput, dangerousInput);

      expect(mockNotify).toHaveBeenCalledWith(
        expect.objectContaining({
          title: '',
          message: '',
        })
      );
    });

    it('should truncate title to 100 characters', () => {
      const longTitle = 'A'.repeat(150);
      desktopNotifier.send(longTitle, 'body');

      const calledArg = mockNotify.mock.calls[0]![0] as { title: string; message: string };
      expect(calledArg.title).toHaveLength(100);
      expect(calledArg.title).toBe('A'.repeat(100));
    });

    it('should truncate body to 500 characters', () => {
      const longBody = 'B'.repeat(600);
      desktopNotifier.send('title', longBody);

      const calledArg = mockNotify.mock.calls[0]![0] as { title: string; message: string };
      expect(calledArg.message).toHaveLength(500);
      expect(calledArg.message).toBe('B'.repeat(500));
    });

    it('should sanitize before truncating', () => {
      // Create a string with metacharacters that when removed would be under 100
      const titleWithMeta = `\`${'A'.repeat(99)}`;
      desktopNotifier.send(titleWithMeta, 'body');

      const calledArg = mockNotify.mock.calls[0]![0] as { title: string; message: string };
      expect(calledArg.title).toBe('A'.repeat(99));
      expect(calledArg.title).toHaveLength(99);
    });

    it('should catch and log node-notifier errors without throwing', () => {
      // eslint-disable-next-line @typescript-eslint/no-empty-function
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      mockNotify.mockImplementation(() => {
        throw new Error('Notification failed');
      });

      expect(() => desktopNotifier.send('title', 'body')).not.toThrow();
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Desktop notification failed'),
        expect.any(Error)
      );

      consoleSpy.mockRestore();
    });
  });
});
