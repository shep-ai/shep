import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockResolve, mockExecute } = vi.hoisted(() => ({
  mockResolve: vi.fn(),
  mockExecute: vi.fn(),
}));

vi.mock('@/infrastructure/di/container.js', () => ({
  container: {
    resolve: (...args: unknown[]) => mockResolve(...args),
  },
}));

vi.mock('@/application/use-cases/notifications/list-notifications.use-case.js', () => ({
  ListNotificationsUseCase: class {
    execute = mockExecute;
  },
}));

import { createLsCommand } from '../../../../../../src/presentation/cli/commands/notifications/ls.command.js';

describe('notifications ls command', () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(vi.fn());
    vi.spyOn(console, 'error').mockImplementation(vi.fn());
    mockResolve.mockImplementation(() => ({
      execute: mockExecute,
    }));
    process.exitCode = undefined;
  });

  it('should create a command named "ls"', () => {
    const cmd = createLsCommand();
    expect(cmd.name()).toBe('ls');
  });

  it('should list notifications', async () => {
    mockExecute.mockResolvedValue({
      ok: true,
      notifications: [
        {
          id: 'notif-1',
          recipientId: 'user-1',
          workItemId: 'wi-1',
          type: 'Assignment',
          title: 'You were assigned',
          isRead: false,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ],
      unreadCount: 1,
    });

    const cmd = createLsCommand();
    await cmd.parseAsync(['user-1'], { from: 'user' });

    const output = consoleSpy.mock.calls.map((c: unknown[]) => c[0]).join('\n');
    expect(output).toContain('assigned');
  });

  it('should show empty message when no notifications', async () => {
    mockExecute.mockResolvedValue({
      ok: true,
      notifications: [],
      unreadCount: 0,
    });

    const cmd = createLsCommand();
    await cmd.parseAsync(['user-1'], { from: 'user' });

    const output = consoleSpy.mock.calls.map((c: unknown[]) => c[0]).join('\n');
    expect(output).toContain('No notifications');
  });

  it('should set exitCode on thrown error', async () => {
    mockExecute.mockRejectedValue(new Error('DB connection failed'));

    const cmd = createLsCommand();
    await cmd.parseAsync(['user-1'], { from: 'user' });

    expect(process.exitCode).toBe(1);
  });
});
