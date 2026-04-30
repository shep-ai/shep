/**
 * Interactive Session Database Mapper
 *
 * Maps between InteractiveSession domain objects and SQLite database rows.
 *
 * Mapping Rules:
 * - TypeScript objects (camelCase) <-> SQL columns (snake_case)
 * - Dates stored as INTEGER (unix milliseconds)
 * - Optional stoppedAt stored as NULL when absent
 * - InteractiveSessionStatus stored as string enum values
 */

import type { InteractiveSession } from '../../../../domain/generated/output.js';
import { type InteractiveSessionStatus } from '../../../../domain/generated/output.js';

/**
 * Database row type matching the interactive_sessions table schema.
 * Uses snake_case column names.
 */
export interface InteractiveSessionRow {
  id: string;
  feature_id: string;
  status: string;
  agent_session_id: string | null;
  turn_status: string;
  started_at: number;
  stopped_at: number | null;
  last_activity_at: number;
  created_at: number;
  updated_at: number;
  total_cost_usd: number;
  total_input_tokens: number;
  total_output_tokens: number;
  total_turns: number;
}

/**
 * InteractiveSession extended with DB columns that are not yet in the
 * TypeSpec-generated domain type (turn_status, agent_session_id, totals).
 * These fields are populated by fromDatabase and are available at runtime.
 */
export type InteractiveSessionFull = InteractiveSession & {
  turnStatus: string;
  agentSessionId: string | null;
  totalCostUsd: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalTurns: number;
};

/**
 * Maps InteractiveSession domain object to database row.
 * Converts Date objects to unix milliseconds for SQL storage.
 */
export function toDatabase(session: InteractiveSession): InteractiveSessionRow {
  const full = session as InteractiveSessionFull;
  return {
    id: session.id,
    feature_id: session.featureId,
    status: session.status,
    agent_session_id: full.agentSessionId ?? null,
    turn_status: full.turnStatus ?? 'idle',
    started_at: session.startedAt instanceof Date ? session.startedAt.getTime() : session.startedAt,
    stopped_at:
      session.stoppedAt instanceof Date ? session.stoppedAt.getTime() : (session.stoppedAt ?? null),
    last_activity_at:
      session.lastActivityAt instanceof Date
        ? session.lastActivityAt.getTime()
        : session.lastActivityAt,
    created_at: session.createdAt instanceof Date ? session.createdAt.getTime() : session.createdAt,
    updated_at: session.updatedAt instanceof Date ? session.updatedAt.getTime() : session.updatedAt,
    total_cost_usd: full.totalCostUsd ?? 0,
    total_input_tokens: full.totalInputTokens ?? 0,
    total_output_tokens: full.totalOutputTokens ?? 0,
    total_turns: full.totalTurns ?? 0,
  };
}

/**
 * Maps database row to InteractiveSessionFull (InteractiveSession + extra DB columns).
 * Converts unix milliseconds back to Date objects.
 */
export function fromDatabase(row: InteractiveSessionRow): InteractiveSessionFull {
  return {
    id: row.id,
    featureId: row.feature_id,
    status: row.status as InteractiveSessionStatus,
    turnStatus: row.turn_status,
    agentSessionId: row.agent_session_id,
    startedAt: new Date(row.started_at),
    lastActivityAt: new Date(row.last_activity_at),
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
    totalCostUsd: row.total_cost_usd ?? 0,
    totalInputTokens: row.total_input_tokens ?? 0,
    totalOutputTokens: row.total_output_tokens ?? 0,
    totalTurns: row.total_turns ?? 0,
    ...(row.stopped_at !== null && { stoppedAt: new Date(row.stopped_at) }),
  };
}
