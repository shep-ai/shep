/**
 * Page Database Mapper
 *
 * Maps between Page domain objects and SQLite database rows.
 */

import type { Page } from '../../../../domain/generated/output.js';

export interface PageRow {
  id: string;
  project_id: string;
  title: string;
  content: string | null;
  parent_id: string | null;
  sort_order: number;
  is_favorite: number;
  created_at: number;
  updated_at: number;
  deleted_at: number | null;
}

export function toDatabase(page: Page): PageRow {
  return {
    id: page.id,
    project_id: page.projectId,
    title: page.title,
    content: page.content ?? null,
    parent_id: page.parentId ?? null,
    sort_order: page.sortOrder,
    is_favorite: page.isFavorite ? 1 : 0,
    created_at: page.createdAt instanceof Date ? page.createdAt.getTime() : page.createdAt,
    updated_at: page.updatedAt instanceof Date ? page.updatedAt.getTime() : page.updatedAt,
    deleted_at: page.deletedAt
      ? page.deletedAt instanceof Date
        ? page.deletedAt.getTime()
        : page.deletedAt
      : null,
  };
}

export function fromDatabase(row: PageRow): Page {
  return {
    id: row.id,
    projectId: row.project_id,
    title: row.title,
    content: row.content ?? undefined,
    parentId: row.parent_id ?? undefined,
    sortOrder: row.sort_order,
    isFavorite: row.is_favorite === 1,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
    deletedAt: row.deleted_at ? new Date(row.deleted_at) : undefined,
  };
}
