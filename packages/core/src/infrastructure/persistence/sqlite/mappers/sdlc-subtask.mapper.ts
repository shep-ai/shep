/**
 * SdlcSubTask Database Mapper
 *
 * Maps between SdlcSubTask domain objects and SQLite database rows.
 *
 * Mapping Rules:
 * - TypeScript objects (camelCase) <-> SQL columns (snake_case)
 * - Dates stored as INTEGER (unix milliseconds)
 * - sort_order stored as REAL (float64) for fractional indexing
 * - status stored as the TaskState string value
 */

import type { SdlcSubTask, TaskState } from '../../../../domain/generated/output.js';

/**
 * Database row type matching the sdlc_subtasks table schema.
 */
export interface SdlcSubTaskRow {
  id: string;
  task_id: string;
  feature_id: string;
  sub_task_key: string;
  name: string;
  description: string | null;
  status: string;
  sort_order: number;
  created_at: number;
  updated_at: number;
}

/**
 * Maps SdlcSubTask domain object to database row.
 */
export function toDatabase(subTask: SdlcSubTask): SdlcSubTaskRow {
  return {
    id: subTask.id,
    task_id: subTask.taskId,
    feature_id: subTask.featureId,
    sub_task_key: subTask.subTaskKey,
    name: subTask.name,
    description: subTask.description ?? null,
    status: subTask.status,
    sort_order: subTask.sortOrder,
    created_at: subTask.createdAt instanceof Date ? subTask.createdAt.getTime() : subTask.createdAt,
    updated_at: subTask.updatedAt instanceof Date ? subTask.updatedAt.getTime() : subTask.updatedAt,
  };
}

/**
 * Maps database row to SdlcSubTask domain object.
 */
export function fromDatabase(row: SdlcSubTaskRow): SdlcSubTask {
  return {
    id: row.id,
    taskId: row.task_id,
    featureId: row.feature_id,
    subTaskKey: row.sub_task_key,
    name: row.name,
    description: row.description ?? undefined,
    status: row.status as TaskState,
    sortOrder: row.sort_order,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}
