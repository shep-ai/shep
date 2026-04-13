import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ListNotificationsUseCase } from '@/application/use-cases/notifications/list-notifications.use-case.js';
import type { INotificationRepository } from '@/application/ports/output/repositories/notification-repository.interface.js';
import type { PmNotification } from '@/domain/generated/output.js';
import { PmNotificationType } from '@/domain/generated/output.js';

const NOTIF: PmNotification = {
  id: 'notif-1',
  projectId: 'proj-1',
  recipientId: 'user-1',
  type: PmNotificationType.Assignment,
  title: 'You were assigned TST-1',
  isRead: false,
  isArchived: false,
  createdAt: new Date(),
  updatedAt: new Date(),
};

function createMockNotifRepo(): INotificationRepository {
  return {
    create: vi.fn(),
    findById: vi.fn(),
    listByRecipient: vi.fn().mockResolvedValue([NOTIF]),
    markRead: vi.fn().mockResolvedValue(undefined),
    markAllRead: vi.fn().mockResolvedValue(undefined),
    archive: vi.fn(),
    countUnread: vi.fn().mockResolvedValue(1),
    softDelete: vi.fn(),
  };
}

describe('ListNotificationsUseCase', () => {
  let useCase: ListNotificationsUseCase;
  let notifRepo: INotificationRepository;

  beforeEach(() => {
    notifRepo = createMockNotifRepo();
    useCase = new ListNotificationsUseCase(notifRepo);
  });

  it('returns notifications for a recipient', async () => {
    const result = await useCase.execute({ recipientId: 'user-1' });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.notifications).toHaveLength(1);
      expect(result.unreadCount).toBe(1);
    }
  });

  it('passes filter options to repository', async () => {
    await useCase.execute({
      recipientId: 'user-1',
      unreadOnly: true,
      projectId: 'proj-1',
      limit: 10,
    });

    expect(notifRepo.listByRecipient).toHaveBeenCalledWith('user-1', {
      unreadOnly: true,
      projectId: 'proj-1',
      limit: 10,
    });
  });

  it('returns empty list when no notifications exist', async () => {
    vi.mocked(notifRepo.listByRecipient).mockResolvedValue([]);
    vi.mocked(notifRepo.countUnread).mockResolvedValue(0);

    const result = await useCase.execute({ recipientId: 'user-1' });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.notifications).toHaveLength(0);
      expect(result.unreadCount).toBe(0);
    }
  });
});
