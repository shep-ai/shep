/**
 * PM Attachment Repository Interface (Output Port)
 *
 * Defines the contract for PmAttachment entity persistence operations.
 * Manages file attachments associated with work items.
 */

import type { PmAttachment } from '../../../../domain/generated/output.js';

export interface IPmAttachmentRepository {
  /** Create a new attachment record. */
  create(attachment: PmAttachment): Promise<void>;

  /** Find an attachment by its unique ID (excludes soft-deleted). */
  findById(id: string): Promise<PmAttachment | null>;

  /** List all non-deleted attachments for a work item. */
  listByWorkItem(workItemId: string): Promise<PmAttachment[]>;

  /** Soft-delete an attachment by setting deletedAt timestamp. */
  softDelete(id: string): Promise<void>;
}
