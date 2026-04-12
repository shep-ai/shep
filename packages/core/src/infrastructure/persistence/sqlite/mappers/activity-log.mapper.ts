/**
 * ActivityEntry Database Mapper
 *
 * Maps between ActivityEntry domain objects and SQLite database rows.
 *
 * Mapping Rules:
 * - TypeScript objects (camelCase) <-> SQL columns (snake_case)
 * - Dates stored as INTEGER (unix milliseconds)
 * - NOTE: No deleted_at — activity_log is an append-only table (NFR-8)
 */

import type { ActivityEntry } from '../../../../domain/generated/output.js';

/**
 * Database row type matching the activity_log table schema.
 */
export interface ActivityEntryRow {
  id: string;
  work_item_id: string;
  field_name: string;
  old_value: string | null;
  new_value: string | null;
  actor_id: string;
  created_at: number;
  updated_at: number;
}

/**
 * Maps ActivityEntry domain object to database row.
 */
export function toDatabase(entry: ActivityEntry): ActivityEntryRow {
  return {
    id: entry.id,
    work_item_id: entry.workItemId,
    field_name: entry.fieldName,
    old_value: entry.oldValue ?? null,
    new_value: entry.newValue ?? null,
    actor_id: entry.actorId,
    created_at: entry.createdAt instanceof Date ? entry.createdAt.getTime() : entry.createdAt,
    updated_at: entry.updatedAt instanceof Date ? entry.updatedAt.getTime() : entry.updatedAt,
  };
}

/**
 * Maps database row to ActivityEntry domain object.
 */
export function fromDatabase(row: ActivityEntryRow): ActivityEntry {
  return {
    id: row.id,
    workItemId: row.work_item_id,
    fieldName: row.field_name,
    oldValue: row.old_value ?? undefined,
    newValue: row.new_value ?? undefined,
    actorId: row.actor_id,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}
