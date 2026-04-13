import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { IAttachmentStorage } from '../../../application/ports/output/services/attachment-storage.interface.js';

/**
 * Local filesystem attachment storage.
 *
 * Stores files in a configurable directory under the shep home path.
 * The IAttachmentStorage port allows this to be swapped for S3 later.
 */
export class LocalAttachmentStorageService implements IAttachmentStorage {
  constructor(private readonly basePath: string) {}

  async store(input: { filename: string; data: Buffer; mimeType: string }): Promise<string> {
    const id = randomUUID();
    const ext = path.extname(input.filename);
    const storagePath = `${id}${ext}`;
    const fullPath = path.join(this.basePath, storagePath);

    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.writeFile(fullPath, input.data);

    return storagePath;
  }

  async retrieve(storagePath: string): Promise<Buffer | null> {
    const fullPath = path.join(this.basePath, storagePath);
    try {
      return await fs.readFile(fullPath);
    } catch {
      return null;
    }
  }

  async delete(storagePath: string): Promise<void> {
    const fullPath = path.join(this.basePath, storagePath);
    try {
      await fs.unlink(fullPath);
    } catch {
      // File may not exist — ignore
    }
  }

  async exists(storagePath: string): Promise<boolean> {
    const fullPath = path.join(this.basePath, storagePath);
    try {
      await fs.access(fullPath);
      return true;
    } catch {
      return false;
    }
  }
}
