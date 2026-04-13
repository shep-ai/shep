'use server';

import { resolve } from '@/lib/server-container';
import type { ListAttachmentsUseCase } from '@shepai/core/application/use-cases/pm-attachments/list-attachments.use-case';
import type { DeleteAttachmentUseCase } from '@shepai/core/application/use-cases/pm-attachments/delete-attachment.use-case';
import type { PmAttachment } from '@shepai/core/domain/generated/output';

export async function listAttachments(
  workItemId: string
): Promise<{ attachments?: PmAttachment[]; error?: string }> {
  try {
    const useCase = resolve<ListAttachmentsUseCase>('ListAttachmentsUseCase');
    const result = await useCase.execute(workItemId);
    return { attachments: result.attachments };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to list attachments';
    return { error: message };
  }
}

export async function deleteAttachment(attachmentId: string): Promise<{ error?: string }> {
  try {
    const useCase = resolve<DeleteAttachmentUseCase>('DeleteAttachmentUseCase');
    const result = await useCase.execute(attachmentId);
    if (!result.ok) return { error: result.error };
    return {};
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to delete attachment';
    return { error: message };
  }
}
