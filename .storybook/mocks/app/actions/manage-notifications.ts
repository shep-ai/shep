export async function listNotifications(
  _input: unknown
): Promise<{ notifications?: unknown[]; unreadCount?: number; error?: string }> {
  return { notifications: [], unreadCount: 0 };
}

export async function markNotificationRead(_notificationId: string): Promise<{ error?: string }> {
  return {};
}

export async function markAllNotificationsRead(
  _recipientId: string,
  _projectId?: string
): Promise<{ error?: string }> {
  return {};
}
