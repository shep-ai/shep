import { describe, it, expect } from 'vitest';
import { AgentActivityState, FeatureState, FeatureStateReason } from '@/domain/generated/output.js';
import {
  compareActivityUrgency,
  DEFAULT_WAIT_TARGETS,
  activityOf,
  activityVersion,
  isTerminalActivity,
  overallActivity,
} from '@/domain/shared/agent-activity.js';

describe('activityOf', () => {
  it.each<[FeatureState, FeatureStateReason, AgentActivityState]>([
    [FeatureState.Running, FeatureStateReason.AgentRunning, AgentActivityState.Working],
    [FeatureState.Running, FeatureStateReason.InProgress, AgentActivityState.Working],
    [FeatureState.ActionRequired, FeatureStateReason.ApprovalGate, AgentActivityState.Blocked],
    [FeatureState.ActionRequired, FeatureStateReason.AwaitingReview, AgentActivityState.Blocked],
    [FeatureState.Queued, FeatureStateReason.QueuedForCapacity, AgentActivityState.Waiting],
    [FeatureState.Pending, FeatureStateReason.Deferred, AgentActivityState.Waiting],
    [FeatureState.Blocked, FeatureStateReason.WaitingOnParent, AgentActivityState.Waiting],
    [FeatureState.Done, FeatureStateReason.RunCompleted, AgentActivityState.Done],
    [FeatureState.Archived, FeatureStateReason.Archived, AgentActivityState.Done],
    [FeatureState.Deleting, FeatureStateReason.Deleting, AgentActivityState.Done],
    [FeatureState.Error, FeatureStateReason.RunFailed, AgentActivityState.Failed],
    [FeatureState.Error, FeatureStateReason.ProcessDied, AgentActivityState.Failed],
  ])('%s (%s) -> %s', (featureState, reason, expected) => {
    expect(activityOf({ featureState, reason, pendingQuestions: 0 })).toEqual({
      state: expected,
      reason,
    });
  });

  it('an open agent question blocks a working feature', () => {
    expect(
      activityOf({
        featureState: FeatureState.Running,
        reason: FeatureStateReason.AgentRunning,
        pendingQuestions: 1,
      })
    ).toEqual({ state: AgentActivityState.Blocked, reason: FeatureStateReason.AgentQuestion });
  });

  it('an open agent question blocks a waiting feature', () => {
    expect(
      activityOf({
        featureState: FeatureState.Queued,
        reason: FeatureStateReason.QueuedForCapacity,
        pendingQuestions: 2,
      }).state
    ).toBe(AgentActivityState.Blocked);
  });

  it('a gate keeps its own reason when questions are also open', () => {
    expect(
      activityOf({
        featureState: FeatureState.ActionRequired,
        reason: FeatureStateReason.ApprovalGate,
        pendingQuestions: 1,
      })
    ).toEqual({ state: AgentActivityState.Blocked, reason: FeatureStateReason.ApprovalGate });
  });

  it('a question left over on a finished or failed feature does not block it', () => {
    for (const [featureState, reason] of [
      [FeatureState.Done, FeatureStateReason.RunCompleted],
      [FeatureState.Error, FeatureStateReason.RunFailed],
    ] as const) {
      expect(activityOf({ featureState, reason, pendingQuestions: 1 }).reason).toBe(reason);
    }
  });
});

describe('activityVersion', () => {
  it('is the newest timestamp in epoch milliseconds', () => {
    expect(
      activityVersion([
        new Date('2026-01-01T00:00:00.000Z'),
        '2026-01-02T00:00:00.000Z',
        undefined,
        null,
        new Date('2025-12-31T00:00:00.000Z').getTime(),
      ])
    ).toBe(Date.parse('2026-01-02T00:00:00.000Z'));
  });

  it('is 0 with no usable timestamp', () => {
    expect(activityVersion([undefined, null, 'not a date'])).toBe(0);
  });
});

describe('compareActivityUrgency', () => {
  it('orders blocked, working, waiting, failed, done', () => {
    const { Blocked, Working, Waiting, Failed, Done } = AgentActivityState;
    expect([Done, Failed, Waiting, Blocked, Working].sort(compareActivityUrgency)).toEqual([
      Blocked,
      Working,
      Waiting,
      Failed,
      Done,
    ]);
  });
});

describe('overallActivity', () => {
  it('ranks blocked over working over waiting over failed over done', () => {
    const { Blocked, Working, Waiting, Failed, Done } = AgentActivityState;
    expect(overallActivity([Done, Working, Blocked])).toBe(Blocked);
    expect(overallActivity([Done, Failed, Working, Waiting])).toBe(Working);
    expect(overallActivity([Done, Failed, Waiting])).toBe(Waiting);
    expect(overallActivity([Done, Failed])).toBe(Failed);
    expect(overallActivity([Done])).toBe(Done);
  });

  it('is done when there is nothing', () => {
    expect(overallActivity([])).toBe(AgentActivityState.Done);
  });
});

describe('isTerminalActivity and DEFAULT_WAIT_TARGETS', () => {
  it('done and failed end a stream; the rest can still change on their own', () => {
    expect(isTerminalActivity(AgentActivityState.Done)).toBe(true);
    expect(isTerminalActivity(AgentActivityState.Failed)).toBe(true);
    expect(isTerminalActivity(AgentActivityState.Blocked)).toBe(false);
    expect(isTerminalActivity(AgentActivityState.Working)).toBe(false);
    expect(isTerminalActivity(AgentActivityState.Waiting)).toBe(false);
  });

  it('waits by default until the feature needs someone or stops', () => {
    expect(DEFAULT_WAIT_TARGETS).toEqual([
      AgentActivityState.Blocked,
      AgentActivityState.Done,
      AgentActivityState.Failed,
    ]);
  });
});
