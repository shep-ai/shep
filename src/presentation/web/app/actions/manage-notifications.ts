'use server';

import { resolve } from '@/lib/server-container';
import type { ListNotificationsUseCase } from '@shepai/core/application/use-cases/notifications/list-notifications.use-case';
import type { MarkNotificationReadUseCase } from '@shepai/core/application/use-cases/notifications/mark-notification-read.use-case';
import type { PmNotification } from '@shepai/core/domain/generated/output';

export async function listNotifications(input: {
  recipientId: string;
  unreadOnly?: boolean;
  projectId?: string;
  limit?: number;
}): Promise<{ notifications?: PmNotification[]; unreadCount?: number; error?: string }> {
  try {
    const useCase = resolve<ListNotificationsUseCase>('ListNotificationsUseCase');
    const result = await useCase.execute(input);
    return { notifications: result.notifications, unreadCount: result.unreadCount };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to list notifications';
    return { error: message };
  }
}

export async function markNotificationRead(notificationId: string): Promise<{ error?: string }> {
  try {
    const useCase = resolve<MarkNotificationReadUseCase>('MarkNotificationReadUseCase');
    const result = await useCase.execute({ notificationId });
    if (!result.ok) return { error: result.error };
    return {};
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to mark notification as read';
    return { error: message };
  }
}

export async function markAllNotificationsRead(
  recipientId: string,
  projectId?: string
): Promise<{ error?: string }> {
  try {
    const useCase = resolve<MarkNotificationReadUseCase>('MarkNotificationReadUseCase');
    const result = await useCase.execute({ recipientId, markAll: true, projectId });
    if (!result.ok) return { error: result.error };
    return {};
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : 'Failed to mark all notifications as read';
    return { error: message };
  }
}
