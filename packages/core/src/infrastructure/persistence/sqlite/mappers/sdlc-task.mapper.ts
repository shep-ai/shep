/**
 * SdlcTask Database Mapper
 *
 * Maps between SdlcTask domain objects and SQLite database rows.
 *
 * Mapping Rules:
 * - TypeScript objects (camelCase) <-> SQL columns (snake_case)
 * - Dates stored as INTEGER (unix milliseconds)
 * - sort_order stored as REAL (float64) for fractional indexing
 * - dependsOnKeys serialized as JSON TEXT; parsed back to string[] (default [])
 * - status stored as the TaskState string value
 */

import type { SdlcTask, TaskState } from '../../../../domain/generated/output.js';

/**
 * Database row type matching the sdlc_tasks table schema.
 */
export interface SdlcTaskRow {
  id: string;
  feature_id: string;
  task_key: string;
  title: string;
  description: string | null;
  status: string;
  sort_order: number;
  branch: string | null;
  depends_on_keys: string | null;
  agent_run_id: string | null;
  created_at: number;
  updated_at: number;
}

/**
 * Maps SdlcTask domain object to database row.
 */
export function toDatabase(task: SdlcTask): SdlcTaskRow {
  return {
    id: task.id,
    feature_id: task.featureId,
    task_key: task.taskKey,
    title: task.title,
    description: task.description ?? null,
    status: task.status,
    sort_order: task.sortOrder,
    branch: task.branch ?? null,
    depends_on_keys:
      task.dependsOnKeys && task.dependsOnKeys.length > 0
        ? JSON.stringify(task.dependsOnKeys)
        : null,
    agent_run_id: task.agentRunId ?? null,
    created_at: task.createdAt instanceof Date ? task.createdAt.getTime() : task.createdAt,
    updated_at: task.updatedAt instanceof Date ? task.updatedAt.getTime() : task.updatedAt,
  };
}

/**
 * Maps database row to SdlcTask domain object.
 */
export function fromDatabase(row: SdlcTaskRow): SdlcTask {
  let dependsOnKeys: string[] = [];
  if (row.depends_on_keys) {
    try {
      const parsed = JSON.parse(row.depends_on_keys) as unknown;
      dependsOnKeys = Array.isArray(parsed) ? (parsed as string[]) : [];
    } catch {
      dependsOnKeys = [];
    }
  }

  return {
    id: row.id,
    featureId: row.feature_id,
    taskKey: row.task_key,
    title: row.title,
    description: row.description ?? undefined,
    status: row.status as TaskState,
    sortOrder: row.sort_order,
    branch: row.branch ?? undefined,
    dependsOnKeys: dependsOnKeys.length > 0 ? dependsOnKeys : undefined,
    agentRunId: row.agent_run_id ?? undefined,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}
