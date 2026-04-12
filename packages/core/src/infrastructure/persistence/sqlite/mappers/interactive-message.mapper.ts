/**
 * Interactive Message Database Mapper
 *
 * Maps between InteractiveMessage domain objects and SQLite database rows.
 *
 * Mapping Rules:
 * - TypeScript objects (camelCase) <-> SQL columns (snake_case)
 * - Dates stored as INTEGER (unix milliseconds)
 * - Optional sessionId stored as NULL when absent
 * - InteractiveMessageRole stored as string enum values
 */

import type { InteractiveMessage } from '../../../../domain/generated/output.js';
import { type InteractiveMessageRole } from '../../../../domain/generated/output.js';

/**
 * Database row type matching the interactive_messages table schema.
 * Uses snake_case column names.
 */
export interface InteractiveMessageRow {
  id: string;
  feature_id: string;
  session_id: string | null;
  role: string;
  content: string;
  step_id: string | null;
  created_at: number;
  updated_at: number;
}

/**
 * Maps InteractiveMessage domain object to database row.
 * Converts Date objects to unix milliseconds for SQL storage.
 */
export function toDatabase(message: InteractiveMessage): InteractiveMessageRow {
  return {
    id: message.id,
    feature_id: message.featureId,
    session_id: message.sessionId ?? null,
    role: message.role,
    content: message.content,
    step_id: message.stepId ?? null,
    created_at: message.createdAt instanceof Date ? message.createdAt.getTime() : message.createdAt,
    updated_at: message.updatedAt instanceof Date ? message.updatedAt.getTime() : message.updatedAt,
  };
}

/**
 * Maps database row to InteractiveMessage domain object.
 * Converts unix milliseconds back to Date objects.
 */
export function fromDatabase(row: InteractiveMessageRow): InteractiveMessage {
  return {
    id: row.id,
    featureId: row.feature_id,
    role: row.role as InteractiveMessageRole,
    content: row.content,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
    ...(row.session_id !== null && { sessionId: row.session_id }),
    ...(row.step_id !== null && { stepId: row.step_id }),
  };
}
