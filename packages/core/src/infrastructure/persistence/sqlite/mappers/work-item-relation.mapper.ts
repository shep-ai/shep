/**
 * WorkItemRelation Database Mapper
 *
 * Maps between WorkItemRelation domain objects and SQLite database rows.
 *
 * Mapping Rules:
 * - TypeScript objects (camelCase) <-> SQL columns (snake_case)
 * - Dates stored as INTEGER (unix milliseconds)
 */

import type { WorkItemRelation } from '../../../../application/ports/output/repositories/work-item-relation-repository.interface.js';

/**
 * Database row type matching the work_item_relations table schema.
 */
export interface WorkItemRelationRow {
  id: string;
  source_work_item_id: string;
  target_work_item_id: string;
  relation_type: string;
  created_at: number;
}

/**
 * Maps WorkItemRelation domain object to database row.
 */
export function toDatabase(relation: WorkItemRelation): WorkItemRelationRow {
  return {
    id: relation.id,
    source_work_item_id: relation.sourceWorkItemId,
    target_work_item_id: relation.targetWorkItemId,
    relation_type: relation.relationType,
    created_at:
      relation.createdAt instanceof Date ? relation.createdAt.getTime() : relation.createdAt,
  };
}

/**
 * Maps database row to WorkItemRelation domain object.
 */
export function fromDatabase(row: WorkItemRelationRow): WorkItemRelation {
  return {
    id: row.id,
    sourceWorkItemId: row.source_work_item_id,
    targetWorkItemId: row.target_work_item_id,
    relationType: row.relation_type,
    createdAt: new Date(row.created_at),
  };
}
