/**
 * Feature Attachment Storage Service Interface
 *
 * Output port for storing feature attachments on disk. Application layer
 * uses this to persist uploaded files in a pending area and commit them to
 * a feature slug directory once the feature is created. Keeps the use case
 * decoupled from the filesystem/SHEP_HOME concerns in infrastructure.
 */

import type { Attachment } from '../../../../domain/generated/output.js';

/** Attachment record extended with SHA-256 hash for dedup tracking. */
export interface StoredAttachment extends Attachment {
  sha256: string;
}

export interface IAttachmentStorageService {
  /**
   * Store a file buffer in the pending attachment directory for a session.
   * Implementations should deduplicate within a session when the same buffer
   * is stored twice.
   */
  store(buffer: Buffer, filename: string, mimeType: string, sessionId: string): StoredAttachment;

  /**
   * Commit pending uploads for a session: move them into the final feature
   * slug directory and return the updated attachment records.
   */
  commit(sessionId: string, featureSlug: string): Attachment[];

  /**
   * Delete all attachments associated with a feature slug.
   */
  delete(featureSlug: string): void;
}
