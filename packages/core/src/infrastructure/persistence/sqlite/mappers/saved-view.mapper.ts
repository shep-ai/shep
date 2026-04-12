/**
 * SavedView Database Mapper
 *
 * Maps between SavedView domain objects and SQLite database rows.
 *
 * Mapping Rules:
 * - TypeScript objects (camelCase) <-> SQL columns (snake_case)
 * - Dates stored as INTEGER (unix milliseconds)
 * - Booleans stored as INTEGER (0 | 1)
 * - JSON configuration stored as TEXT
 */

import type { SavedView } from '../../../../domain/generated/output.js';

/**
 * Database row type matching the saved_views table schema.
 */
export interface SavedViewRow {
  id: string;
  project_id: string;
  name: string;
  description: string | null;
  is_public: number;
  layout: string;
  configuration: string;
  created_by: string | null;
  created_at: number;
  updated_at: number;
  deleted_at: number | null;
}

/**
 * Maps SavedView domain object to database row.
 */
export function toDatabase(view: SavedView): SavedViewRow {
  return {
    id: view.id,
    project_id: view.projectId,
    name: view.name,
    description: view.description ?? null,
    is_public: view.isPublic ? 1 : 0,
    layout: view.layout,
    configuration: view.configuration,
    created_by: view.createdBy ?? null,
    created_at: view.createdAt instanceof Date ? view.createdAt.getTime() : view.createdAt,
    updated_at: view.updatedAt instanceof Date ? view.updatedAt.getTime() : view.updatedAt,
    deleted_at: view.deletedAt
      ? view.deletedAt instanceof Date
        ? view.deletedAt.getTime()
        : view.deletedAt
      : null,
  };
}

/**
 * Maps database row to SavedView domain object.
 */
export function fromDatabase(row: SavedViewRow): SavedView {
  return {
    id: row.id,
    projectId: row.project_id,
    name: row.name,
    description: row.description ?? undefined,
    isPublic: row.is_public === 1,
    layout: row.layout as SavedView['layout'],
    configuration: row.configuration,
    createdBy: row.created_by ?? undefined,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
    deletedAt: row.deleted_at ? new Date(row.deleted_at) : undefined,
  };
}
