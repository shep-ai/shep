/**
 * Inputs of a reflection on one feature run (spec 150).
 *
 * `RunSignals` are what the run itself knows at its end — the graph state the
 * reflection node reads. Everything persisted (phase timings, transcripts,
 * the harness, earlier lessons) is gathered by the use cases.
 */

import type { AgentType, CiFixRecord } from '../../../domain/generated/output.js';

export interface RunSignals {
  /** The feature merged in this run. */
  merged: boolean;
  /** Last CI status seen, when the run reached CI. */
  ciStatus?: string | null;
  ciFixAttempts: number;
  ciFixHistory: CiFixRecord[];
  /** Feedback a person gave when rejecting a phase, oldest first. */
  rejectionFeedback: string[];
  /** Schema-validation repairs the run needed. */
  validationRepairs: number;
  lastValidationErrors: string[];
  /** The run's final error, when it failed. */
  error?: string | null;
}

export interface ReflectOnFeatureRunInput {
  featureId: string;
  /** The feature's repository (scopes the harness and lessons). */
  repositoryPath: string;
  /** The worktree the run worked in (its agent sessions live under it). */
  worktreePath: string;
  /** Agent that ran the feature (selects its transcripts). */
  agentType: AgentType;
  /** Learned-harness version the run used, when any. */
  versionId?: string;
  signals: RunSignals;
}
