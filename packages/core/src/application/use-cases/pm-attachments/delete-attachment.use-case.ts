import { injectable, inject } from 'tsyringe';
import type { IPmAttachmentRepository } from '../../ports/output/repositories/pm-attachment-repository.interface.js';

export type DeleteAttachmentResult = { ok: true } | { ok: false; error: string };

@injectable()
export class DeleteAttachmentUseCase {
  constructor(
    @inject('IPmAttachmentRepository') private readonly attachmentRepo: IPmAttachmentRepository
  ) {}

  async execute(attachmentId: string): Promise<DeleteAttachmentResult> {
    const attachment = await this.attachmentRepo.findById(attachmentId);
    if (!attachment) return { ok: false, error: 'Attachment not found' };

    await this.attachmentRepo.softDelete(attachmentId);
    return { ok: true };
  }
}
