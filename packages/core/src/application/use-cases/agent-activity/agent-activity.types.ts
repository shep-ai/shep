/**
 * Agent activity view model (spec 149).
 *
 * What a caller outside shep's UI needs to know about a feature's agent: the
 * activity state and why, what it waits on, and a version to order updates by.
 * Every adapter (MCP, A2A, CLI, terminal hosts) reads this one shape.
 */

import type {
  ActivityWaitOutcome,
  AgentActivityState,
  AgentRunStatus,
  AgentType,
  FeatureConsoleAction,
  FeatureState,
  FeatureStateReason,
  SdlcLifecycle,
} from '../../../domain/generated/output.js';
import type {
  FeatureConsolePullRequest,
  FeatureConsoleQuestion,
} from '../feature-console/feature-console.types.js';

export interface AgentActivity {
  featureId: string;
  shortId: string;
  name: string;
  repositoryPath: string;
  branch: string;
  state: AgentActivityState;
  /** Why the feature is in {@link state}. */
  reason: FeatureStateReason;
  featureState: FeatureState;
  lifecycle: SdlcLifecycle;
  /** Agent graph node (`requirements`, `plan`, `implement`, …). */
  phase: string;
  runId?: string;
  runStatus?: AgentRunStatus;
  agentType?: AgentType;
  /** Open agent questions, gate mirrors excluded. */
  pendingQuestions: number;
  /** The oldest open question, when one blocks the feature. */
  pendingQuestion?: FeatureConsoleQuestion;
  /** The run's error message, when it failed. */
  error?: string;
  pr?: FeatureConsolePullRequest;
  /** What the run accepts right now (approve, reject, stop, resume). */
  actions: FeatureConsoleAction[];
  /**
   * Epoch ms of the newest write behind this activity. Strictly increasing
   * within one watch; between two reads it can drop when an open question is
   * answered before anything else is written, so compare state as well.
   */
  version: number;
  updatedAt: Date;
}

export interface AgentActivitySnapshot {
  generatedAt: Date;
  /** Most urgent first. */
  activities: AgentActivity[];
  counts: Record<AgentActivityState, number>;
  /** The most urgent state present; done when there is nothing. */
  overall: AgentActivityState;
}

export interface GetAgentActivityInput {
  /** A feature id or id prefix. Asking for a feature always returns it, settled or archived. */
  featureId?: string;
  repositoryPath?: string;
  /** Include done features in a list. Default false. */
  includeSettled?: boolean;
}

export interface GetAgentActivityResult extends AgentActivitySnapshot {
  /** True when `featureId` matched nothing. */
  notFound: boolean;
}

/** Default gap between two activity reads while watching or waiting. */
export const DEFAULT_ACTIVITY_POLL_MS = 1000;

/**
 * Longest single wait a request-bound caller (an MCP tool call, a web request)
 * may ask for. HTTP clients and MCP clients time a call out, so a wait must end;
 * a caller that needs longer asks again.
 */
export const MAX_ACTIVITY_WAIT_MS = 600_000;

export interface WatchAgentActivityInput extends GetAgentActivityInput {
  /** Stops the watch; the generator returns. */
  signal?: AbortSignal;
  intervalMs?: number;
}

export interface AgentActivityChange {
  activity: AgentActivity;
  /** The state before this change; absent the first time a feature is seen. */
  previous?: Pick<AgentActivity, 'state' | 'reason'>;
  /** Strictly increasing within one watch; equal to `activity.version`. */
  version: number;
}

export interface WaitForAgentActivityInput {
  /** Feature id or id prefix. */
  featureId: string;
  /** States to wait for; default `DEFAULT_WAIT_TARGETS` (blocked, done, failed). */
  until?: readonly AgentActivityState[];
  /** Give up after this long; wait forever when absent. */
  timeoutMs?: number;
  signal?: AbortSignal;
  intervalMs?: number;
}

export interface WaitForAgentActivityResult {
  outcome: ActivityWaitOutcome;
  /** The matching activity, or the last one seen before a timeout or abort. */
  activity?: AgentActivity;
}
