/**
 * Workflow Step Repository Port
 *
 * Persistence interface for workflow steps executed inside an
 * interactive session. Implementations are the single source of
 * truth for the lifecycle of each step — pending → running → done/
 * failed/interrupted — and the orchestrator MUST write status
 * transitions synchronously around the agent invocation so that a
 * crash or refresh at any instant observes a consistent picture.
 */

import type { WorkflowStep, WorkflowStepStatus } from '../../../../domain/generated/output.js';

export interface IWorkflowStepRepository {
  /** Insert a single step row (used by `ensureSteps`). */
  create(step: WorkflowStep): Promise<void>;

  /**
   * Bulk-insert the initial step list for a session if no rows
   * exist yet for `(sessionId, workflowId)`. Returns the full
   * current step list regardless of whether rows were created now
   * or already existed. Idempotent by design so the orchestrator
   * can safely call it on resume.
   */
  ensureSteps(
    sessionId: string,
    workflowId: string,
    featureId: string,
    seeds: readonly StepSeed[]
  ): Promise<WorkflowStep[]>;

  /** Fetch a single step by id, or null if not found. */
  findById(stepId: string): Promise<WorkflowStep | null>;

  /** Fetch all steps for a session, ordered by step_index ascending. */
  listBySession(sessionId: string): Promise<WorkflowStep[]>;

  /** Fetch all steps for a feature scope, ordered by step_index ascending. */
  listByFeature(featureId: string): Promise<WorkflowStep[]>;

  /**
   * Update the status of a step. When transitioning to `running`,
   * also stamps `startedAt`; to any terminal state, also stamps
   * `finishedAt`. Atomic single-row UPDATE.
   */
  updateStatus(
    stepId: string,
    status: WorkflowStepStatus,
    metadata?: Record<string, unknown>
  ): Promise<void>;

  /**
   * Recovery sweep — marks every row currently in `running` status
   * across the whole database as `interrupted`. Called once during
   * daemon bootstrap before any session becomes reachable, so any
   * step that was running when the previous process died is caught.
   */
  markAllRunningAsInterrupted(): Promise<number>;

  /** Delete all steps for a feature scope (used on chat clear). */
  deleteByFeatureId(featureId: string): Promise<void>;
}

/** Seed data for `ensureSteps` — the workflow definition's view of a step. */
export interface StepSeed {
  stepKey: string;
  stepIndex: number;
  title: string;
  description: string;
}
