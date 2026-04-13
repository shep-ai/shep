export async function listAttachments(
  _workItemId: string
): Promise<{ attachments?: unknown[]; error?: string }> {
  return { attachments: [] };
}

export async function deleteAttachment(_attachmentId: string): Promise<{ error?: string }> {
  return {};
}
