import { injectable, inject } from 'tsyringe';
import type { PmAttachment } from '../../../domain/generated/output.js';
import type { IPmAttachmentRepository } from '../../ports/output/repositories/pm-attachment-repository.interface.js';

export interface ListAttachmentsResult {
  ok: true;
  attachments: PmAttachment[];
}

@injectable()
export class ListAttachmentsUseCase {
  constructor(
    @inject('IPmAttachmentRepository') private readonly attachmentRepo: IPmAttachmentRepository
  ) {}

  async execute(workItemId: string): Promise<ListAttachmentsResult> {
    const attachments = await this.attachmentRepo.listByWorkItem(workItemId);
    return { ok: true, attachments };
  }
}
