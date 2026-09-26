/**
 * Agent Run Database Mapper
 *
 * Maps between AgentRun domain objects and SQLite database rows.
 *
 * Mapping Rules:
 * - TypeScript objects (camelCase) <-> SQL columns (snake_case)
 * - Dates stored as INTEGER (unix milliseconds)
 * - Optional fields stored as NULL when missing
 * - AgentType and AgentRunStatus stored as string values
 */

import type { AgentRun, ApprovalGates } from '../../../../domain/generated/output.js';
import { type AgentType, type AgentRunStatus } from '../../../../domain/generated/output.js';
import { parseAgentEffort } from '../../../../domain/shared/agent-effort.js';

/**
 * Database row type matching the agent_runs table schema.
 * Uses snake_case column names.
 */
export interface AgentRunRow {
  id: string;
  agent_type: string;
  agent_name: string;
  status: string;
  prompt: string;
  result: string | null;
  session_id: string | null;
  thread_id: string;
  pid: number | null;
  last_heartbeat: number | null;
  started_at: number | null;
  completed_at: number | null;
  error: string | null;
  feature_id: string | null;
  repository_path: string | null;
  created_at: number;
  updated_at: number;
  approval_gates: string | null;
  model_id: string | null;
  effort: string | null;
}

/**
 * Maps AgentRun domain object to database row.
 * Converts Date objects to unix milliseconds for SQL storage.
 *
 * @param agentRun - AgentRun domain object
 * @returns Database row object with snake_case columns
 */
export function toDatabase(agentRun: AgentRun): AgentRunRow {
  return {
    id: agentRun.id,
    agent_type: agentRun.agentType,
    agent_name: agentRun.agentName,
    status: agentRun.status,
    prompt: agentRun.prompt,
    result: agentRun.result ?? null,
    session_id: agentRun.sessionId ?? null,
    thread_id: agentRun.threadId,
    pid: agentRun.pid ?? null,
    last_heartbeat:
      agentRun.lastHeartbeat instanceof Date ? agentRun.lastHeartbeat.getTime() : null,
    started_at: agentRun.startedAt instanceof Date ? agentRun.startedAt.getTime() : null,
    completed_at: agentRun.completedAt instanceof Date ? agentRun.completedAt.getTime() : null,
    error: agentRun.error ?? null,
    feature_id: agentRun.featureId ?? null,
    repository_path: agentRun.repositoryPath ?? null,
    created_at:
      agentRun.createdAt instanceof Date ? agentRun.createdAt.getTime() : agentRun.createdAt,
    updated_at:
      agentRun.updatedAt instanceof Date ? agentRun.updatedAt.getTime() : agentRun.updatedAt,
    approval_gates: agentRun.approvalGates ? JSON.stringify(agentRun.approvalGates) : null,
    model_id: agentRun.modelId ?? null,
    effort: agentRun.effort ?? null,
  };
}

/**
 * Maps database row to AgentRun domain object.
 * Converts unix milliseconds back to Date objects.
 * Excludes optional fields that are NULL.
 *
 * @param row - Database row with snake_case columns
 * @returns AgentRun domain object with camelCase properties
 */
export function fromDatabase(row: AgentRunRow): AgentRun {
  return {
    id: row.id,
    agentType: row.agent_type as AgentType,
    agentName: row.agent_name,
    status: row.status as AgentRunStatus,
    prompt: row.prompt,
    threadId: row.thread_id,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
    ...(row.result !== null && { result: row.result }),
    ...(row.session_id !== null && { sessionId: row.session_id }),
    ...(row.pid !== null && { pid: row.pid }),
    ...(row.last_heartbeat !== null && { lastHeartbeat: new Date(row.last_heartbeat) }),
    ...(row.started_at !== null && { startedAt: new Date(row.started_at) }),
    ...(row.completed_at !== null && { completedAt: new Date(row.completed_at) }),
    ...(row.error !== null && { error: row.error }),
    ...(row.feature_id !== null && { featureId: row.feature_id }),
    ...(row.repository_path !== null && { repositoryPath: row.repository_path }),
    ...(row.approval_gates !== null && {
      approvalGates: JSON.parse(row.approval_gates) as ApprovalGates,
    }),
    ...(row.model_id !== null && { modelId: row.model_id }),
    ...effortFromRow(row.effort),
  };
}

/** Unknown stored values read back as absent (agent default), never passed on. */
function effortFromRow(value: string | null): Pick<AgentRun, 'effort'> {
  const effort = parseAgentEffort(value);
  return effort ? { effort } : {};
}
