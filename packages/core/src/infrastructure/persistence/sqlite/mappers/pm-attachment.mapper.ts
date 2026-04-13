/**
 * PmAttachment Database Mapper
 *
 * Maps between PmAttachment domain objects and SQLite database rows.
 */

import type { PmAttachment } from '../../../../domain/generated/output.js';

export interface PmAttachmentRow {
  id: string;
  work_item_id: string;
  filename: string;
  mime_type: string;
  file_size: number;
  storage_path: string;
  created_at: number;
  updated_at: number;
  deleted_at: number | null;
}

export function toDatabase(attachment: PmAttachment): PmAttachmentRow {
  return {
    id: attachment.id,
    work_item_id: attachment.workItemId,
    filename: attachment.filename,
    mime_type: attachment.mimeType,
    file_size: attachment.fileSize,
    storage_path: attachment.storagePath,
    created_at:
      attachment.createdAt instanceof Date ? attachment.createdAt.getTime() : attachment.createdAt,
    updated_at:
      attachment.updatedAt instanceof Date ? attachment.updatedAt.getTime() : attachment.updatedAt,
    deleted_at: attachment.deletedAt
      ? attachment.deletedAt instanceof Date
        ? attachment.deletedAt.getTime()
        : attachment.deletedAt
      : null,
  };
}

export function fromDatabase(row: PmAttachmentRow): PmAttachment {
  return {
    id: row.id,
    workItemId: row.work_item_id,
    filename: row.filename,
    mimeType: row.mime_type,
    fileSize: row.file_size,
    storagePath: row.storage_path,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
    deletedAt: row.deleted_at ? new Date(row.deleted_at) : undefined,
  };
}
