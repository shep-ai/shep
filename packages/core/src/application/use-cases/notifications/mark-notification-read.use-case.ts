import { injectable, inject } from 'tsyringe';
import type { INotificationRepository } from '../../ports/output/repositories/notification-repository.interface.js';

export interface MarkNotificationReadInput {
  notificationId?: string;
  recipientId?: string;
  markAll?: boolean;
  projectId?: string;
}

export type MarkNotificationReadResult = { ok: true } | { ok: false; error: string };

@injectable()
export class MarkNotificationReadUseCase {
  constructor(
    @inject('INotificationRepository') private readonly notifRepo: INotificationRepository
  ) {}

  async execute(input: MarkNotificationReadInput): Promise<MarkNotificationReadResult> {
    if (input.markAll && input.recipientId) {
      await this.notifRepo.markAllRead(input.recipientId, input.projectId);
      return { ok: true };
    }

    if (!input.notificationId) {
      return { ok: false, error: 'Either notificationId or markAll with recipientId is required.' };
    }

    const notif = await this.notifRepo.findById(input.notificationId);
    if (!notif) {
      return { ok: false, error: `Notification not found: "${input.notificationId}"` };
    }

    await this.notifRepo.markRead(input.notificationId);
    return { ok: true };
  }
}
