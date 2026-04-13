import { injectable } from 'tsyringe';
import { mkdirSync, writeFileSync, renameSync, rmSync, existsSync, readdirSync } from 'fs';
import { join, basename } from 'path';
import { createHash, randomUUID } from 'crypto';
import type { Attachment } from '../../domain/generated/output.js';
import type {
  IAttachmentStorageService,
  StoredAttachment,
} from '../../application/ports/output/services/feature-attachment-storage.interface.js';
import { getShepHomeDir } from './filesystem/shep-directory.service.js';

// Re-export the port's StoredAttachment shape to preserve the existing type
// surface for legacy consumers that import it from this module.
export type { StoredAttachment };

@injectable()
export class AttachmentStorageService implements IAttachmentStorageService {
  /** In-memory dedup index: sessionId -> Map<sha256, StoredAttachment> */
  private readonly dedupIndex = new Map<string, Map<string, StoredAttachment>>();

  /**
   * Store a file buffer in the pending attachment directory within SHEP_HOME.
   * Returns existing record if SHA-256 matches (dedup within same session).
   */
  store(buffer: Buffer, filename: string, mimeType: string, sessionId: string): StoredAttachment {
    const hash = createHash('sha256').update(buffer).digest('hex');

    // Check dedup
    const sessionMap = this.dedupIndex.get(sessionId);
    if (sessionMap?.has(hash)) {
      return sessionMap.get(hash)!;
    }

    const sanitized = this.uniqueFilename(this.sanitizeFilename(filename), hash);
    const pendingDir = this.getPendingDir(sessionId);
    mkdirSync(pendingDir, { recursive: true });

    const filePath = join(pendingDir, sanitized);
    writeFileSync(filePath, buffer);

    const attachment: StoredAttachment = {
      id: randomUUID(),
      name: sanitized,
      size: BigInt(buffer.length),
      mimeType,
      path: filePath.replace(/\\/g, '/'),
      createdAt: new Date(),
      sha256: hash,
    };

    // Track for dedup
    if (!this.dedupIndex.has(sessionId)) {
      this.dedupIndex.set(sessionId, new Map());
    }
    this.dedupIndex.get(sessionId)!.set(hash, attachment);

    return attachment;
  }

  /**
   * Commit pending uploads: rename pending dir to feature slug dir,
   * update paths on all attachment records.
   */
  commit(sessionId: string, featureSlug: string): Attachment[] {
    const pendingDir = this.getPendingDir(sessionId);
    const slugDir = this.getSlugDir(featureSlug);

    if (!existsSync(pendingDir)) {
      return [];
    }

    // Rename atomically
    mkdirSync(this.getAttachmentsRoot(), { recursive: true });
    renameSync(pendingDir, slugDir);

    // Build updated attachment records
    const sessionMap = this.dedupIndex.get(sessionId);
    const attachments: Attachment[] = [];

    if (sessionMap) {
      for (const stored of sessionMap.values()) {
        const newPath = join(slugDir, basename(stored.path));
        attachments.push({
          id: stored.id,
          name: stored.name,
          size: stored.size,
          mimeType: stored.mimeType,
          path: newPath.replace(/\\/g, '/'),
          createdAt: stored.createdAt,
        });
      }
      this.dedupIndex.delete(sessionId);
    } else {
      // Fallback: read files from slugDir
      const files = readdirSync(slugDir);
      for (const file of files) {
        const filePath = join(slugDir, file);
        attachments.push({
          id: randomUUID(),
          name: file,
          size: BigInt(0),
          mimeType: 'application/octet-stream',
          path: filePath.replace(/\\/g, '/'),
          createdAt: new Date(),
        });
      }
    }

    return attachments;
  }

  /**
   * Delete all attachments for a feature.
   */
  delete(featureSlug: string): void {
    const slugDir = this.getSlugDir(featureSlug);
    if (existsSync(slugDir)) {
      rmSync(slugDir, { recursive: true, force: true });
    }
  }

  private getAttachmentsRoot(): string {
    return join(getShepHomeDir(), 'attachments');
  }

  private getPendingDir(sessionId: string): string {
    return join(getShepHomeDir(), 'attachments', `pending-${sessionId}`);
  }

  private getSlugDir(featureSlug: string): string {
    return join(getShepHomeDir(), 'attachments', featureSlug);
  }

  /** Generate unique filename by appending content hash when name collides (e.g. clipboard "image.png"). */
  private uniqueFilename(filename: string, hash: string): string {
    const dot = filename.lastIndexOf('.');
    if (dot <= 0) return `${filename}-${hash.slice(0, 8)}`;
    return `${filename.slice(0, dot)}-${hash.slice(0, 8)}${filename.slice(dot)}`;
  }

  /** Strip path traversal and non-safe characters from filenames. */
  private sanitizeFilename(filename: string): string {
    // Remove path components, keep only the filename
    let name = basename(filename);
    // Remove path traversal
    name = name.replace(/\.\./g, '');
    // Replace non-alphanumeric chars (except dot, hyphen, underscore) with underscore
    name = name.replace(/[^a-zA-Z0-9._-]/g, '_');
    // Remove leading dots (hidden files)
    name = name.replace(/^\.+/, '');
    // Fallback if empty
    return name || 'unnamed';
  }
}
