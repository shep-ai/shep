/**
 * Page Repository Interface (Output Port)
 *
 * Defines the contract for Page entity persistence operations.
 * Supports hierarchical page structures with parent-child relationships.
 */

import type { Page } from '../../../../domain/generated/output.js';

export interface IPageRepository {
  /** Create a new page record. */
  create(page: Page): Promise<void>;

  /** Find a page by its unique ID (excludes soft-deleted). */
  findById(id: string): Promise<Page | null>;

  /** List all non-deleted pages for a project. */
  listByProject(projectId: string): Promise<Page[]>;

  /** List all non-deleted child pages of a given parent page. */
  listChildren(parentId: string): Promise<Page[]>;

  /** Update mutable fields on an existing page. */
  update(
    id: string,
    fields: Partial<Pick<Page, 'title' | 'content' | 'parentId' | 'sortOrder' | 'isFavorite'>>
  ): Promise<void>;

  /** Soft-delete a page by setting deletedAt timestamp. */
  softDelete(id: string): Promise<void>;
}
