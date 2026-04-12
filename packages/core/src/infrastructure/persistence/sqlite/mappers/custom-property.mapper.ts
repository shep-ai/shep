/**
 * CustomProperty Database Mapper
 *
 * Maps between CustomProperty domain objects and SQLite database rows.
 *
 * Mapping Rules:
 * - TypeScript objects (camelCase) <-> SQL columns (snake_case)
 * - Dates stored as INTEGER (unix milliseconds)
 * - Booleans stored as INTEGER (0 | 1)
 * - JSON options stored as TEXT
 */

import type { CustomProperty } from '../../../../domain/generated/output.js';

/**
 * Database row type matching the custom_properties table schema.
 */
export interface CustomPropertyRow {
  id: string;
  project_id: string;
  name: string;
  property_type: string;
  options: string | null;
  is_required: number;
  display_order: number;
  created_at: number;
  updated_at: number;
  deleted_at: number | null;
}

/**
 * Maps CustomProperty domain object to database row.
 */
export function toDatabase(prop: CustomProperty): CustomPropertyRow {
  return {
    id: prop.id,
    project_id: prop.projectId,
    name: prop.name,
    property_type: prop.propertyType,
    options: prop.options ?? null,
    is_required: prop.isRequired ? 1 : 0,
    display_order: prop.displayOrder,
    created_at: prop.createdAt instanceof Date ? prop.createdAt.getTime() : prop.createdAt,
    updated_at: prop.updatedAt instanceof Date ? prop.updatedAt.getTime() : prop.updatedAt,
    deleted_at: prop.deletedAt
      ? prop.deletedAt instanceof Date
        ? prop.deletedAt.getTime()
        : prop.deletedAt
      : null,
  };
}

/**
 * Maps database row to CustomProperty domain object.
 */
export function fromDatabase(row: CustomPropertyRow): CustomProperty {
  return {
    id: row.id,
    projectId: row.project_id,
    name: row.name,
    propertyType: row.property_type as CustomProperty['propertyType'],
    options: row.options ?? undefined,
    isRequired: row.is_required === 1,
    displayOrder: row.display_order,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
    deletedAt: row.deleted_at ? new Date(row.deleted_at) : undefined,
  };
}
