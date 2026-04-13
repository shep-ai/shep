/**
 * PmNotification Repository Interface (Output Port)
 *
 * Defines the contract for PmNotification entity persistence operations.
 * Implementations handle database-specific logic (SQLite, etc.).
 */

import type { PmNotification } from '../../../../domain/generated/output.js';

export interface INotificationRepository {
  create(notification: PmNotification): Promise<void>;
  findById(id: string): Promise<PmNotification | null>;
  listByRecipient(
    recipientId: string,
    options?: { unreadOnly?: boolean; projectId?: string; limit?: number }
  ): Promise<PmNotification[]>;
  markRead(id: string): Promise<void>;
  markAllRead(recipientId: string, projectId?: string): Promise<void>;
  archive(id: string): Promise<void>;
  countUnread(recipientId: string, projectId?: string): Promise<number>;
  softDelete(id: string): Promise<void>;
}
