/**
 * Agent activity (spec 148).
 *
 * Folds a feature's state and the reason behind it into the five states other
 * agent systems speak — working, blocked, waiting, done, failed — so MCP
 * clients, A2A orchestrators, `shep feat wait` and terminal hosts like Herdr
 * all read the same answer. Built on `explainFeatureState`; never stored.
 *
 * Import convention for `domain/`: generated types only, no I/O, and relative
 * imports without a file extension (the web bundler consumes this directory).
 */

import { AgentActivityState, FeatureState, FeatureStateReason } from '../generated/output';

/** Activity of each feature state before open agent questions are considered. */
const ACTIVITY_BY_FEATURE_STATE: Record<FeatureState, AgentActivityState> = {
  [FeatureState.Running]: AgentActivityState.Working,
  [FeatureState.ActionRequired]: AgentActivityState.Blocked,
  [FeatureState.Blocked]: AgentActivityState.Waiting,
  [FeatureState.Pending]: AgentActivityState.Waiting,
  [FeatureState.Queued]: AgentActivityState.Waiting,
  [FeatureState.Done]: AgentActivityState.Done,
  [FeatureState.Error]: AgentActivityState.Failed,
  [FeatureState.Deleting]: AgentActivityState.Done,
  [FeatureState.Archived]: AgentActivityState.Done,
};

/** Activities an open agent question turns into blocked: the feature can still move. */
const QUESTION_BLOCKABLE: ReadonlySet<AgentActivityState> = new Set([
  AgentActivityState.Working,
  AgentActivityState.Waiting,
]);

/** Activities that end on their own: nothing more happens without someone resuming. */
const TERMINAL: ReadonlySet<AgentActivityState> = new Set([
  AgentActivityState.Done,
  AgentActivityState.Failed,
]);

/** Overall order, most urgent first: what a single badge for many features shows. */
const OVERALL_RANK: Record<AgentActivityState, number> = {
  [AgentActivityState.Blocked]: 0,
  [AgentActivityState.Working]: 1,
  [AgentActivityState.Waiting]: 2,
  [AgentActivityState.Failed]: 3,
  [AgentActivityState.Done]: 4,
};

/** What a waiter waits for when it names nothing: someone is needed, or the work stopped. */
export const DEFAULT_WAIT_TARGETS: readonly AgentActivityState[] = [
  AgentActivityState.Blocked,
  AgentActivityState.Done,
  AgentActivityState.Failed,
];

export interface ActivityInput {
  featureState: FeatureState;
  reason: FeatureStateReason;
  /** The feature's open agent questions, gate mirrors excluded. */
  pendingQuestions: number;
}

export interface ActivityExplanation {
  state: AgentActivityState;
  reason: FeatureStateReason;
}

/** A feature's activity and why. A gate keeps its reason; an open question blocks the rest. */
export function activityOf(input: ActivityInput): ActivityExplanation {
  const state = ACTIVITY_BY_FEATURE_STATE[input.featureState];
  if (input.pendingQuestions > 0 && QUESTION_BLOCKABLE.has(state)) {
    return { state: AgentActivityState.Blocked, reason: FeatureStateReason.AgentQuestion };
  }
  return { state, reason: input.reason };
}

/**
 * A version to order updates by: the newest of the given timestamps in epoch
 * milliseconds, 0 when none is usable. Writes that change a feature's activity
 * bump the feature, its run or add a question; answering a question removes
 * one, so the version can drop then — watchers clamp it to strictly increase.
 */
export function activityVersion(timestamps: readonly unknown[]): number {
  let newest = 0;
  for (const value of timestamps) {
    const ms = toEpochMs(value);
    if (ms !== undefined && ms > newest) newest = ms;
  }
  return newest;
}

/** The one state that sums up many features: the most urgent present, done when none. */
export function overallActivity(states: readonly AgentActivityState[]): AgentActivityState {
  let overall: AgentActivityState = AgentActivityState.Done;
  for (const state of states) {
    if (OVERALL_RANK[state] < OVERALL_RANK[overall]) overall = state;
  }
  return overall;
}

/** True for done and failed: the activity will not change on its own. */
export function isTerminalActivity(state: AgentActivityState): boolean {
  return TERMINAL.has(state);
}

function toEpochMs(value: unknown): number | undefined {
  if (value === undefined || value === null) return undefined;
  const ms =
    value instanceof Date
      ? value.getTime()
      : typeof value === 'number'
        ? value
        : typeof value === 'string'
          ? Date.parse(value)
          : Number.NaN;
  return Number.isFinite(ms) ? ms : undefined;
}
