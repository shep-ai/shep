/**
 * Feature console view model (spec 142).
 *
 * What `shep tui` draws, decided in core so any surface could draw the same
 * thing: the presentation layer formats these values and makes no decisions.
 */

import type {
  AgentActivityState,
  AgentRunStatus,
  AgentType,
  CiStatus,
  FeatureConsoleAction,
  FeatureState,
  FeatureStateReason,
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

/** The open agent question a feature waits on (spec 148). */
export interface FeatureConsoleQuestion {
  id: string;
  /** Scope the question was filed under; answering needs it. */
  appId?: string;
  prompt: string;
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
  /** The rule that decided {@link state}. */
  stateReason: FeatureStateReason;
  /** What the agent is doing, in the vocabulary other agent systems share (spec 148). */
  activity: AgentActivityState;
  /** Why: {@link stateReason}, or `agent-question` when an open question blocks it. */
  activityReason: FeatureStateReason;
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
  /** The oldest of {@link pendingQuestions}, when there is one. */
  pendingQuestion?: FeatureConsoleQuestion;
  /**
   * Epoch ms of the newest write behind this row (feature, run, open questions).
   * A watch makes it strictly increasing; see `AgentActivity.version`.
   */
  version: number;
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
  /** The most urgent activity among the rows; done when there are none. */
  activity: AgentActivityState;
}

/**
 * The admission-queue pause in force, as the console needs it.
 *
 * `pausedAt` is a `Date`, not the generated `FleetQueuePause`'s `utcDateTime`
 * (emitted as `any`), because the banner measures the pause's age and `any`
 * would let that arithmetic go unchecked.
 */
export interface FeatureConsoleQueuePause {
  pausedAt: Date;
  reason: string;
}

/**
 * The fleet's own state, as the console shows it (spec 148).
 *
 * A parked admission queue and a tripped circuit breaker are fleet-wide
 * conditions, not per-feature ones: `waiting` stops draining while a pause is
 * in force, and no row can explain why. Both arrive decided, like every other
 * value in this snapshot, so the view formats without judging.
 */
export interface FeatureConsoleFleet {
  /** Present only while the queue is parked. */
  queuePause?: FeatureConsoleQueuePause;
  /** True when the breaker's failure thresholds are met, paused or not. */
  circuitBreakerTripped: boolean;
  /** The threshold that was crossed; present with a trip. */
  circuitBreakerReason?: string;
}

export interface FeatureConsoleSnapshot {
  generatedAt: Date;
  /** Already in display order. */
  rows: FeatureConsoleRow[];
  summary: FeatureConsoleSummary;
  /** The pause and breaker verdict behind the counts. */
  fleet: FeatureConsoleFleet;
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
