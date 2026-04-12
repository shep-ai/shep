/**
 * Label Database Mapper
 *
 * Maps between Label domain objects and SQLite database rows.
 *
 * Mapping Rules:
 * - TypeScript objects (camelCase) <-> SQL columns (snake_case)
 * - Dates stored as INTEGER (unix milliseconds)
 */

import type { Label } from '../../../../domain/generated/output.js';

/**
 * Database row type matching the labels table schema.
 */
export interface LabelRow {
  id: string;
  project_id: string;
  name: string;
  color: string;
  parent_id: string | null;
  created_at: number;
  updated_at: number;
  deleted_at: number | null;
}

/**
 * Maps Label domain object to database row.
 */
export function toDatabase(label: Label): LabelRow {
  return {
    id: label.id,
    project_id: label.projectId,
    name: label.name,
    color: label.color,
    parent_id: label.parentId ?? null,
    created_at: label.createdAt instanceof Date ? label.createdAt.getTime() : label.createdAt,
    updated_at: label.updatedAt instanceof Date ? label.updatedAt.getTime() : label.updatedAt,
    deleted_at: label.deletedAt
      ? label.deletedAt instanceof Date
        ? label.deletedAt.getTime()
        : label.deletedAt
      : null,
  };
}

/**
 * Maps database row to Label domain object.
 */
export function fromDatabase(row: LabelRow): Label {
  return {
    id: row.id,
    projectId: row.project_id,
    name: row.name,
    color: row.color,
    parentId: row.parent_id ?? undefined,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
    deletedAt: row.deleted_at ? new Date(row.deleted_at) : undefined,
  };
}
