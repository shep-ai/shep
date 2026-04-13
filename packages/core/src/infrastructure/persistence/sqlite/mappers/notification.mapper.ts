/**
 * PmNotification Database Mapper
 *
 * Maps between PmNotification domain objects and SQLite database rows.
 */

import type { PmNotification } from '../../../../domain/generated/output.js';

export interface PmNotificationRow {
  id: string;
  project_id: string;
  recipient_id: string;
  type: string;
  title: string;
  body: string | null;
  is_read: number;
  is_archived: number;
  reference_id: string | null;
  reference_type: string | null;
  created_at: number;
  updated_at: number;
  deleted_at: number | null;
}

export function toDatabase(notification: PmNotification): PmNotificationRow {
  return {
    id: notification.id,
    project_id: notification.projectId,
    recipient_id: notification.recipientId,
    type: notification.type,
    title: notification.title,
    body: notification.body ?? null,
    is_read: notification.isRead ? 1 : 0,
    is_archived: notification.isArchived ? 1 : 0,
    reference_id: notification.referenceId ?? null,
    reference_type: notification.referenceType ?? null,
    created_at:
      notification.createdAt instanceof Date
        ? notification.createdAt.getTime()
        : notification.createdAt,
    updated_at:
      notification.updatedAt instanceof Date
        ? notification.updatedAt.getTime()
        : notification.updatedAt,
    deleted_at: notification.deletedAt
      ? notification.deletedAt instanceof Date
        ? notification.deletedAt.getTime()
        : notification.deletedAt
      : null,
  };
}

export function fromDatabase(row: PmNotificationRow): PmNotification {
  return {
    id: row.id,
    projectId: row.project_id,
    recipientId: row.recipient_id,
    type: row.type as PmNotification['type'],
    title: row.title,
    body: row.body ?? undefined,
    isRead: row.is_read === 1,
    isArchived: row.is_archived === 1,
    referenceId: row.reference_id ?? undefined,
    referenceType: row.reference_type ?? undefined,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
    deletedAt: row.deleted_at ? new Date(row.deleted_at) : undefined,
  };
}
