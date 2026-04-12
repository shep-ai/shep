/**
 * Comment Database Mapper
 *
 * Maps between Comment domain objects and SQLite database rows.
 *
 * Mapping Rules:
 * - TypeScript objects (camelCase) <-> SQL columns (snake_case)
 * - Dates stored as INTEGER (unix milliseconds)
 */

import type { Comment } from '../../../../domain/generated/output.js';

/**
 * Database row type matching the comments table schema.
 */
export interface CommentRow {
  id: string;
  work_item_id: string;
  parent_id: string | null;
  content: string;
  author_id: string;
  created_at: number;
  updated_at: number;
  deleted_at: number | null;
}

/**
 * Maps Comment domain object to database row.
 */
export function toDatabase(comment: Comment): CommentRow {
  return {
    id: comment.id,
    work_item_id: comment.workItemId,
    parent_id: comment.parentId ?? null,
    content: comment.content,
    author_id: comment.authorId,
    created_at: comment.createdAt instanceof Date ? comment.createdAt.getTime() : comment.createdAt,
    updated_at: comment.updatedAt instanceof Date ? comment.updatedAt.getTime() : comment.updatedAt,
    deleted_at: comment.deletedAt
      ? comment.deletedAt instanceof Date
        ? comment.deletedAt.getTime()
        : comment.deletedAt
      : null,
  };
}

/**
 * Maps database row to Comment domain object.
 */
export function fromDatabase(row: CommentRow): Comment {
  return {
    id: row.id,
    workItemId: row.work_item_id,
    parentId: row.parent_id ?? undefined,
    content: row.content,
    authorId: row.author_id,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
    deletedAt: row.deleted_at ? new Date(row.deleted_at) : undefined,
  };
}
