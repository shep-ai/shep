import { injectable, inject } from 'tsyringe';
import { randomUUID } from 'node:crypto';
import type { Comment } from '../../../domain/generated/output.js';
import type { ICommentRepository } from '../../ports/output/repositories/comment-repository.interface.js';

export interface CreateCommentInput {
  workItemId: string;
  content: string;
  authorId: string;
  parentId?: string;
}

export type ManageCommentResult =
  | { ok: true; comment?: Comment; comments?: Comment[] }
  | { ok: false; error: string };

@injectable()
export class ManageCommentsUseCase {
  constructor(@inject('ICommentRepository') private readonly commentRepo: ICommentRepository) {}

  async list(workItemId: string): Promise<Comment[]> {
    return this.commentRepo.listByWorkItem(workItemId);
  }

  async create(input: CreateCommentInput): Promise<ManageCommentResult> {
    if (!input.content.trim()) {
      return { ok: false, error: 'Comment content is required.' };
    }
    const now = new Date();
    const comment: Comment = {
      id: randomUUID(),
      workItemId: input.workItemId,
      content: input.content,
      authorId: input.authorId,
      parentId: input.parentId,
      createdAt: now,
      updatedAt: now,
    };
    await this.commentRepo.create(comment);
    return { ok: true, comment };
  }

  async update(commentId: string, content: string): Promise<ManageCommentResult> {
    const existing = await this.commentRepo.findById(commentId);
    if (!existing) {
      return { ok: false, error: `Comment not found: "${commentId}"` };
    }
    await this.commentRepo.update(commentId, { content });
    return { ok: true };
  }

  async delete(commentId: string): Promise<ManageCommentResult> {
    const existing = await this.commentRepo.findById(commentId);
    if (!existing) {
      return { ok: false, error: `Comment not found: "${commentId}"` };
    }
    await this.commentRepo.softDelete(commentId);
    return { ok: true };
  }
}
