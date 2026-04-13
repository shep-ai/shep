import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MarkNotificationReadUseCase } from '@/application/use-cases/notifications/mark-notification-read.use-case.js';
import type { INotificationRepository } from '@/application/ports/output/repositories/notification-repository.interface.js';
import type { PmNotification } from '@/domain/generated/output.js';
import { PmNotificationType } from '@/domain/generated/output.js';

const UNREAD_NOTIF: PmNotification = {
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
    findById: vi.fn().mockResolvedValue(UNREAD_NOTIF),
    listByRecipient: vi.fn(),
    markRead: vi.fn().mockResolvedValue(undefined),
    markAllRead: vi.fn().mockResolvedValue(undefined),
    archive: vi.fn(),
    countUnread: vi.fn(),
    softDelete: vi.fn(),
  };
}

describe('MarkNotificationReadUseCase', () => {
  let useCase: MarkNotificationReadUseCase;
  let notifRepo: INotificationRepository;

  beforeEach(() => {
    notifRepo = createMockNotifRepo();
    useCase = new MarkNotificationReadUseCase(notifRepo);
  });

  it('marks a single notification as read', async () => {
    const result = await useCase.execute({ notificationId: 'notif-1' });

    expect(result.ok).toBe(true);
    expect(notifRepo.markRead).toHaveBeenCalledWith('notif-1');
  });

  it('marks all notifications as read for a recipient', async () => {
    const result = await useCase.execute({
      recipientId: 'user-1',
      markAll: true,
    });

    expect(result.ok).toBe(true);
    expect(notifRepo.markAllRead).toHaveBeenCalledWith('user-1', undefined);
  });

  it('scopes mark-all to project when provided', async () => {
    const result = await useCase.execute({
      recipientId: 'user-1',
      markAll: true,
      projectId: 'proj-1',
    });

    expect(result.ok).toBe(true);
    expect(notifRepo.markAllRead).toHaveBeenCalledWith('user-1', 'proj-1');
  });

  it('returns error for nonexistent notification', async () => {
    vi.mocked(notifRepo.findById).mockResolvedValue(null);

    const result = await useCase.execute({ notificationId: 'nonexistent' });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('not found');
  });

  it('returns error when neither notificationId nor markAll provided', async () => {
    const result = await useCase.execute({});

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('notificationId');
  });
});
