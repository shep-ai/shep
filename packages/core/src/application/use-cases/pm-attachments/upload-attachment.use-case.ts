import { injectable, inject } from 'tsyringe';
import { randomUUID } from 'node:crypto';
import type { PmAttachment } from '../../../domain/generated/output.js';
import type { IPmAttachmentRepository } from '../../ports/output/repositories/pm-attachment-repository.interface.js';
import type { IWorkItemRepository } from '../../ports/output/repositories/work-item-repository.interface.js';

const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25 MB

export type UploadAttachmentResult =
  | { ok: true; attachment: PmAttachment }
  | { ok: false; error: string };

@injectable()
export class UploadAttachmentUseCase {
  constructor(
    @inject('IPmAttachmentRepository') private readonly attachmentRepo: IPmAttachmentRepository,
    @inject('IWorkItemRepository') private readonly workItemRepo: IWorkItemRepository
  ) {}

  async execute(input: {
    workItemId: string;
    filename: string;
    mimeType: string;
    fileSize: number;
    storagePath: string;
  }): Promise<UploadAttachmentResult> {
    const workItem = await this.workItemRepo.findById(input.workItemId);
    if (!workItem) return { ok: false, error: 'Work item not found' };

    if (input.fileSize > MAX_FILE_SIZE) {
      return { ok: false, error: 'File exceeds maximum size of 25MB' };
    }

    if (!input.filename.trim()) {
      return { ok: false, error: 'Filename is required' };
    }

    const now = new Date();
    const attachment: PmAttachment = {
      id: randomUUID(),
      workItemId: input.workItemId,
      filename: input.filename,
      mimeType: input.mimeType,
      fileSize: input.fileSize,
      storagePath: input.storagePath,
      createdAt: now,
      updatedAt: now,
      deletedAt: undefined,
    };

    await this.attachmentRepo.create(attachment);
    return { ok: true, attachment };
  }
}
