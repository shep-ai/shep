/**
 * Workflow Step Database Mapper
 *
 * Maps between `WorkflowStep` domain objects and SQLite rows.
 */

import type { WorkflowStep, WorkflowStepStatus } from '../../../../domain/generated/output.js';

export interface WorkflowStepRow {
  id: string;
  session_id: string;
  feature_id: string;
  workflow_id: string;
  step_key: string;
  step_index: number;
  title: string;
  description: string;
  status: string;
  started_at: number | null;
  finished_at: number | null;
  metadata: string | null;
  created_at: number;
  updated_at: number;
}

function ts(value: unknown): number {
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'number') return value;
  if (typeof value === 'string') return new Date(value).getTime();
  return Date.now();
}

export function toDatabase(step: WorkflowStep): WorkflowStepRow {
  return {
    id: step.id,
    session_id: step.sessionId,
    feature_id: step.featureId,
    workflow_id: step.workflowId,
    step_key: step.stepKey,
    step_index: step.stepIndex,
    title: step.title,
    description: step.description,
    status: step.status,
    started_at: step.startedAt ? ts(step.startedAt) : null,
    finished_at: step.finishedAt ? ts(step.finishedAt) : null,
    metadata: step.metadata ?? null,
    created_at: ts(step.createdAt),
    updated_at: ts(step.updatedAt),
  };
}

export function fromDatabase(row: WorkflowStepRow): WorkflowStep {
  return {
    id: row.id,
    sessionId: row.session_id,
    featureId: row.feature_id,
    workflowId: row.workflow_id,
    stepKey: row.step_key,
    stepIndex: row.step_index,
    title: row.title,
    description: row.description,
    status: row.status as WorkflowStepStatus,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
    ...(row.started_at !== null && { startedAt: new Date(row.started_at) }),
    ...(row.finished_at !== null && { finishedAt: new Date(row.finished_at) }),
    ...(row.metadata !== null && { metadata: row.metadata }),
  };
}
