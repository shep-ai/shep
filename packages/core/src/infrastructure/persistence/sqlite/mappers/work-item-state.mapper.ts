/**
 * WorkItemState Database Mapper
 *
 * Maps between WorkItemState domain objects and SQLite database rows.
 *
 * Mapping Rules:
 * - TypeScript objects (camelCase) <-> SQL columns (snake_case)
 * - Dates stored as INTEGER (unix milliseconds)
 * - Booleans stored as INTEGER (0 | 1)
 */

import type { WorkItemState } from '../../../../domain/generated/output.js';

/**
 * Database row type matching the work_item_states table schema.
 */
export interface WorkItemStateRow {
  id: string;
  project_id: string;
  name: string;
  color: string;
  display_order: number;
  state_group: string;
  is_default: number;
  created_at: number;
  updated_at: number;
  deleted_at: number | null;
}

/**
 * Maps WorkItemState domain object to database row.
 */
export function toDatabase(state: WorkItemState): WorkItemStateRow {
  return {
    id: state.id,
    project_id: state.projectId,
    name: state.name,
    color: state.color,
    display_order: state.displayOrder,
    state_group: state.stateGroup,
    is_default: state.isDefault ? 1 : 0,
    created_at: state.createdAt instanceof Date ? state.createdAt.getTime() : state.createdAt,
    updated_at: state.updatedAt instanceof Date ? state.updatedAt.getTime() : state.updatedAt,
    deleted_at: state.deletedAt
      ? state.deletedAt instanceof Date
        ? state.deletedAt.getTime()
        : state.deletedAt
      : null,
  };
}

/**
 * Maps database row to WorkItemState domain object.
 */
export function fromDatabase(row: WorkItemStateRow): WorkItemState {
  return {
    id: row.id,
    projectId: row.project_id,
    name: row.name,
    color: row.color,
    displayOrder: row.display_order,
    stateGroup: row.state_group as WorkItemState['stateGroup'],
    isDefault: row.is_default === 1,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
    deletedAt: row.deleted_at ? new Date(row.deleted_at) : undefined,
  };
}
