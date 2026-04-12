/**
 * WorkItem Database Mapper
 *
 * Maps between WorkItem domain objects and SQLite database rows.
 *
 * Mapping Rules:
 * - TypeScript objects (camelCase) <-> SQL columns (snake_case)
 * - Dates stored as INTEGER (unix milliseconds)
 * - sort_order stored as REAL (float64) for fractional indexing
 * - JSON objects stored as TEXT
 */

import type { WorkItem } from '../../../../domain/generated/output.js';

/**
 * Database row type matching the work_items table schema.
 */
export interface WorkItemRow {
  id: string;
  project_id: string;
  sequence_id: number;
  identifier_prefix: string;
  title: string;
  description: string | null;
  state_id: string;
  priority: string;
  parent_id: string | null;
  sort_order: number;
  start_date: number | null;
  due_date: number | null;
  estimate_value: string | null;
  custom_property_values: string | null;
  created_at: number;
  updated_at: number;
  deleted_at: number | null;
}

/**
 * Maps WorkItem domain object to database row.
 */
export function toDatabase(item: WorkItem): WorkItemRow {
  return {
    id: item.id,
    project_id: item.projectId,
    sequence_id: item.sequenceId,
    identifier_prefix: item.identifierPrefix,
    title: item.title,
    description: item.description ?? null,
    state_id: item.stateId,
    priority: item.priority,
    parent_id: item.parentId ?? null,
    sort_order: item.sortOrder,
    start_date: item.startDate
      ? item.startDate instanceof Date
        ? item.startDate.getTime()
        : item.startDate
      : null,
    due_date: item.dueDate
      ? item.dueDate instanceof Date
        ? item.dueDate.getTime()
        : item.dueDate
      : null,
    estimate_value: item.estimateValue ?? null,
    custom_property_values: item.customPropertyValues ?? null,
    created_at: item.createdAt instanceof Date ? item.createdAt.getTime() : item.createdAt,
    updated_at: item.updatedAt instanceof Date ? item.updatedAt.getTime() : item.updatedAt,
    deleted_at: item.deletedAt
      ? item.deletedAt instanceof Date
        ? item.deletedAt.getTime()
        : item.deletedAt
      : null,
  };
}

/**
 * Maps database row to WorkItem domain object.
 */
export function fromDatabase(row: WorkItemRow): WorkItem {
  return {
    id: row.id,
    projectId: row.project_id,
    sequenceId: row.sequence_id,
    identifierPrefix: row.identifier_prefix,
    title: row.title,
    description: row.description ?? undefined,
    stateId: row.state_id,
    priority: row.priority as WorkItem['priority'],
    parentId: row.parent_id ?? undefined,
    sortOrder: row.sort_order,
    startDate: row.start_date !== null ? new Date(row.start_date) : undefined,
    dueDate: row.due_date !== null ? new Date(row.due_date) : undefined,
    estimateValue: row.estimate_value ?? undefined,
    customPropertyValues: row.custom_property_values ?? undefined,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
    deletedAt: row.deleted_at ? new Date(row.deleted_at) : undefined,
  };
}
