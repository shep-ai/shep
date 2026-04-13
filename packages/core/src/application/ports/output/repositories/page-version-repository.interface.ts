/**
 * Page Version Repository Interface (Output Port)
 *
 * Defines the contract for PageVersion entity persistence operations.
 * Tracks version history for wiki-style page content.
 */

import type { PageVersion } from '../../../../domain/generated/output.js';

export interface IPageVersionRepository {
  /** Create a new page version record. */
  create(version: PageVersion): Promise<void>;

  /** List all versions for a page, ordered by version number. */
  listByPage(pageId: string): Promise<PageVersion[]>;

  /** Find the latest (highest version number) version for a page. */
  findLatest(pageId: string): Promise<PageVersion | null>;

  /** Find a specific version by page ID and version number. */
  findByVersion(pageId: string, versionNumber: number): Promise<PageVersion | null>;
}
