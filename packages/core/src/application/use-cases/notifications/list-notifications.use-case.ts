import { injectable, inject } from 'tsyringe';
import type { PmNotification } from '../../../domain/generated/output.js';
import type { INotificationRepository } from '../../ports/output/repositories/notification-repository.interface.js';

export interface ListNotificationsInput {
  recipientId: string;
  unreadOnly?: boolean;
  projectId?: string;
  limit?: number;
}

export interface ListNotificationsResult {
  ok: true;
  notifications: PmNotification[];
  unreadCount: number;
}

@injectable()
export class ListNotificationsUseCase {
  constructor(
    @inject('INotificationRepository') private readonly notifRepo: INotificationRepository
  ) {}

  async execute(input: ListNotificationsInput): Promise<ListNotificationsResult> {
    const options: { unreadOnly?: boolean; projectId?: string; limit?: number } = {};
    if (input.unreadOnly !== undefined) options.unreadOnly = input.unreadOnly;
    if (input.projectId !== undefined) options.projectId = input.projectId;
    if (input.limit !== undefined) options.limit = input.limit;

    const notifications = await this.notifRepo.listByRecipient(
      input.recipientId,
      Object.keys(options).length > 0 ? options : undefined
    );
    const unreadCount = await this.notifRepo.countUnread(input.recipientId, input.projectId);

    return { ok: true, notifications, unreadCount };
  }
}
