'use server';

import { resolve } from '@/lib/server-container';
import type {
  ManageCommentsUseCase,
  CreateCommentInput,
} from '@shepai/core/application/use-cases/comments/manage-comments.use-case';
import type { Comment } from '@shepai/core/domain/generated/output';

export async function listComments(
  workItemId: string
): Promise<{ comments?: Comment[]; error?: string }> {
  if (!workItemId?.trim()) {
    return { error: 'Work item ID is required' };
  }

  try {
    const useCase = resolve<ManageCommentsUseCase>('ManageCommentsUseCase');
    const comments = await useCase.list(workItemId);
    return { comments };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to list comments';
    return { error: message };
  }
}

export async function createComment(
  input: CreateCommentInput
): Promise<{ comment?: Comment; error?: string }> {
  try {
    const useCase = resolve<ManageCommentsUseCase>('ManageCommentsUseCase');
    const result = await useCase.create(input);
    if (!result.ok) return { error: result.error };
    return { comment: result.comment };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to create comment';
    return { error: message };
  }
}

export async function updateComment(
  commentId: string,
  content: string
): Promise<{ error?: string }> {
  if (!commentId?.trim()) {
    return { error: 'Comment ID is required' };
  }

  try {
    const useCase = resolve<ManageCommentsUseCase>('ManageCommentsUseCase');
    const result = await useCase.update(commentId, content);
    if (!result.ok) return { error: result.error };
    return {};
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to update comment';
    return { error: message };
  }
}

export async function deleteComment(commentId: string): Promise<{ error?: string }> {
  if (!commentId?.trim()) {
    return { error: 'Comment ID is required' };
  }

  try {
    const useCase = resolve<ManageCommentsUseCase>('ManageCommentsUseCase');
    const result = await useCase.delete(commentId);
    if (!result.ok) return { error: result.error };
    return {};
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to delete comment';
    return { error: message };
  }
}
