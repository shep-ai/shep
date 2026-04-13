/**
 * PageVersion Database Mapper
 *
 * Maps between PageVersion domain objects and SQLite database rows.
 */

import type { PageVersion } from '../../../../domain/generated/output.js';

export interface PageVersionRow {
  id: string;
  page_id: string;
  version_number: number;
  title: string;
  content: string | null;
  created_at: number;
  updated_at: number;
}

export function toDatabase(pageVersion: PageVersion): PageVersionRow {
  return {
    id: pageVersion.id,
    page_id: pageVersion.pageId,
    version_number: pageVersion.versionNumber,
    title: pageVersion.title,
    content: pageVersion.content ?? null,
    created_at:
      pageVersion.createdAt instanceof Date
        ? pageVersion.createdAt.getTime()
        : pageVersion.createdAt,
    updated_at:
      pageVersion.updatedAt instanceof Date
        ? pageVersion.updatedAt.getTime()
        : pageVersion.updatedAt,
  };
}

export function fromDatabase(row: PageVersionRow): PageVersion {
  return {
    id: row.id,
    pageId: row.page_id,
    versionNumber: row.version_number,
    title: row.title,
    content: row.content ?? undefined,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}
