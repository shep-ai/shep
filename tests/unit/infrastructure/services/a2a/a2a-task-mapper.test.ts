/**
 * A2A task mapping (spec 149): a feature's activity as an A2A 1.0 Task, in
 * ProtoJSON (enum names, a Part holding exactly one of text/data).
 */

import { describe, it, expect } from 'vitest';
import type { AgentActivity } from '@/application/use-cases/agent-activity/agent-activity.types.js';
import {
  AgentActivityState,
  FeatureConsoleAction,
  FeatureState,
  FeatureStateReason,
  SdlcLifecycle,
} from '@/domain/generated/output.js';
import { statusUpdateOf, taskOf } from '@/infrastructure/services/a2a/a2a-task-mapper.js';

function activity(overrides: Partial<AgentActivity> = {}): AgentActivity {
  return {
    featureId: 'f-1',
    shortId: 'f-1',
    name: 'Login page',
    repositoryPath: '/work/acme',
    branch: 'feat/login',
    state: AgentActivityState.Working,
    reason: FeatureStateReason.AgentRunning,
    featureState: FeatureState.Running,
    lifecycle: SdlcLifecycle.Implementation,
    phase: 'implement',
    pendingQuestions: 0,
    actions: [FeatureConsoleAction.Stop],
    version: 1_700_000_000_000,
    updatedAt: new Date('2026-10-26T10:00:00.000Z'),
    ...overrides,
  };
}

describe('taskOf', () => {
  it('uses the feature id as task and context id, with shep details in metadata', () => {
    const task = taskOf(activity());

    expect(task.id).toBe('f-1');
    expect(task.contextId).toBe('f-1');
    expect(task.status.state).toBe('TASK_STATE_WORKING');
    expect(task.status.timestamp).toBe('2026-10-26T10:00:00.000Z');
    expect(task.metadata.shep).toMatchObject({
      name: 'Login page',
      repositoryPath: '/work/acme',
      branch: 'feat/login',
      activity: 'working',
      reason: 'agent-running',
      phase: 'implement',
      version: 1_700_000_000_000,
      actions: ['stop'],
    });
    expect(task.artifacts).toEqual([]);
    expect(task.history).toEqual([]);
  });

  it.each<[AgentActivityState, FeatureStateReason, string]>([
    [AgentActivityState.Working, FeatureStateReason.AgentRunning, 'TASK_STATE_WORKING'],
    [AgentActivityState.Blocked, FeatureStateReason.ApprovalGate, 'TASK_STATE_INPUT_REQUIRED'],
    [AgentActivityState.Waiting, FeatureStateReason.QueuedForCapacity, 'TASK_STATE_SUBMITTED'],
    [AgentActivityState.Done, FeatureStateReason.RunCompleted, 'TASK_STATE_COMPLETED'],
    [AgentActivityState.Failed, FeatureStateReason.RunFailed, 'TASK_STATE_FAILED'],
    [AgentActivityState.Failed, FeatureStateReason.RunCancelled, 'TASK_STATE_CANCELED'],
  ])('%s (%s) -> %s', (state, reason, expected) => {
    expect(taskOf(activity({ state, reason })).status.state).toBe(expected);
  });

  it('an agent message in the status says what is asked and how to answer', () => {
    const gate = taskOf(
      activity({
        state: AgentActivityState.Blocked,
        reason: FeatureStateReason.ApprovalGate,
        phase: 'plan',
      })
    );
    expect(gate.status.message).toMatchObject({
      role: 'ROLE_AGENT',
      taskId: 'f-1',
      contextId: 'f-1',
    });
    const gateText = gate.status.message.parts[0].text ?? '';
    expect(gateText).toContain('plan');
    expect(gateText).toContain('"decision"');

    const question = taskOf(
      activity({
        state: AgentActivityState.Blocked,
        reason: FeatureStateReason.AgentQuestion,
        pendingQuestion: { id: 'q1', prompt: 'Which database?' },
      })
    );
    expect(question.status.message.parts[0].text).toContain('Which database?');
  });

  it('a failed task carries the run error', () => {
    const task = taskOf(
      activity({
        state: AgentActivityState.Failed,
        reason: FeatureStateReason.RunFailed,
        error: 'tests failed',
      })
    );
    expect(task.status.message.parts[0].text).toContain('tests failed');
  });

  it('every part holds exactly one content field', () => {
    const task = taskOf(activity());
    for (const part of task.status.message.parts) {
      const content = ['text', 'raw', 'url', 'data'].filter((k) => k in part);
      expect(content).toHaveLength(1);
    }
  });
});

describe('statusUpdateOf', () => {
  it('is a status-update event for the same task', () => {
    const update = statusUpdateOf(activity({ state: AgentActivityState.Done }));
    expect(update).toMatchObject({
      taskId: 'f-1',
      contextId: 'f-1',
      status: { state: 'TASK_STATE_COMPLETED' },
    });
  });
});
