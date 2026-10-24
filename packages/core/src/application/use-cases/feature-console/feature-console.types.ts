/**
 * Feature console view model (spec 142).
 *
 * What `shep tui` draws, decided in core so any surface could draw the same
 * thing: the presentation layer formats these values and makes no decisions.
 */

import type {
  AgentRunStatus,
  AgentType,
  CiStatus,
  FeatureConsoleAction,
  FeatureState,
  PrStatus,
  SdlcLifecycle,
} from '../../../domain/generated/output.js';

/** Number of id characters shown and accepted as a prefix, as `feat ls` does. */
export const FEATURE_SHORT_ID_LENGTH = 8;

export interface FeatureConsolePullRequest {
  number: number;
  url: string;
  status: PrStatus;
  ciStatus?: CiStatus;
}

export interface FeatureConsoleRow {
  featureId: string;
  /** The first {@link FEATURE_SHORT_ID_LENGTH} characters of the id. */
  shortId: string;
  name: string;
  /** Registered repository name, else the path's last segment. */
  repositoryName: string;
  repositoryPath: string;
  branch: string;
  worktreePath?: string;
  lifecycle: SdlcLifecycle;
  state: FeatureState;
  /** Agent graph node (`requirements`, `plan`, `implement`, …) the feature is in. */
  phase: string;
  agentType?: AgentType;
  modelId?: string;
  runId?: string;
  runStatus?: AgentRunStatus;
  /** Active time of the current run: finished phases plus any phase still open. */
  elapsedMs: number;
  /** Sum of the current run's phase costs; undefined when no phase reported one. */
  costUsd?: number;
  inputTokens: number;
  outputTokens: number;
  pendingQuestions: number;
  /** The user is holding this feature up (a gate, or an open question). */
  needsAttention: boolean;
  /** Console actions the current run accepts, in display order. */
  actions: FeatureConsoleAction[];
  pr?: FeatureConsolePullRequest;
  /** The run's error message, when it failed. */
  error?: string;
  updatedAt: Date;
}

export interface FeatureConsoleSummary {
  total: number;
  needsAttention: number;
  running: number;
  /** Queued, blocked or pending. */
  waiting: number;
  failed: number;
  done: number;
}

export interface FeatureConsoleSnapshot {
  generatedAt: Date;
  /** Already in display order. */
  rows: FeatureConsoleRow[];
  summary: FeatureConsoleSummary;
}

export interface GetFeatureConsoleSnapshotInput {
  /** Limit to one repository. */
  repositoryPath?: string;
  includeArchived?: boolean;
}

export interface FeatureConsoleActionResult {
  ok: boolean;
  /** Why the action did not run, or what happened when it did. */
  message: string;
}

export interface FeatureLogTail {
  /** Absent when the feature has no run yet. */
  logPath?: string;
  lines: string[];
}
