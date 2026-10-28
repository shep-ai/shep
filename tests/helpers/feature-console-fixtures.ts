/**
 * Console view-model fixtures (specs 142, 149).
 *
 * One complete `FeatureConsoleRow` and summary, so adding a field to the view
 * model means updating one place instead of every test that builds a row.
 */

import {
  AgentActivityState,
  AgentRunStatus,
  FeatureConsoleAction,
  FeatureState,
  FeatureStateReason,
  SdlcLifecycle,
} from '@/domain/generated/output.js';
import type {
  FeatureConsoleFleet,
  FeatureConsoleRow,
  FeatureConsoleSummary,
} from '@/application/use-cases/feature-console/feature-console.types.js';

/** A running feature; override what the test is about. */
export function consoleRow(overrides: Partial<FeatureConsoleRow> = {}): FeatureConsoleRow {
  return {
    featureId: 'feature-1',
    shortId: 'feature-',
    name: 'Feature',
    repositoryName: 'acme',
    repositoryPath: '/work/acme',
    branch: 'feat/feature',
    lifecycle: SdlcLifecycle.Implementation,
    state: FeatureState.Running,
    stateReason: FeatureStateReason.AgentRunning,
    activity: AgentActivityState.Working,
    activityReason: FeatureStateReason.AgentRunning,
    phase: 'implement',
    runId: 'run-1',
    runStatus: AgentRunStatus.running,
    elapsedMs: 0,
    inputTokens: 0,
    outputTokens: 0,
    pendingQuestions: 0,
    version: 0,
    needsAttention: false,
    actions: [FeatureConsoleAction.Stop],
    updatedAt: new Date('2026-10-24T12:00:00Z'),
    ...overrides,
  };
}

/** The fields that make a row a feature waiting at an approval gate. */
export const GATE_ROW: Partial<FeatureConsoleRow> = {
  state: FeatureState.ActionRequired,
  stateReason: FeatureStateReason.ApprovalGate,
  activity: AgentActivityState.Blocked,
  activityReason: FeatureStateReason.ApprovalGate,
  runStatus: AgentRunStatus.waitingApproval,
  needsAttention: true,
  actions: [FeatureConsoleAction.Approve, FeatureConsoleAction.Reject],
};

/** A summary with nothing in it; override the counts the test is about. */
export function consoleSummary(
  overrides: Partial<FeatureConsoleSummary> = {}
): FeatureConsoleSummary {
  return {
    total: 0,
    needsAttention: 0,
    running: 0,
    waiting: 0,
    failed: 0,
    done: 0,
    activity: AgentActivityState.Done,
    ...overrides,
  };
}

/** A fleet with nothing to report: no paused queue, breaker closed. */
export const HEALTHY_FLEET: FeatureConsoleFleet = { circuitBreakerTripped: false };
