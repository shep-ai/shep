import { describe, it, expect } from 'vitest';
import {
  AgentRunStatus,
  AgentType,
  BuildMode,
  FeatureConsoleAction,
  FeatureState,
  FeatureStateReason,
  SdlcLifecycle,
  TaskState,
} from '@/domain/generated/output.js';
import type { AgentRun, Feature } from '@/domain/generated/output.js';
import {
  agentNodeOf,
  availableFeatureActions,
  compareConsoleRows,
  deriveFeatureState,
  explainFeatureState,
  featurePhaseOf,
  isActiveFeatureState,
  needsUserAttention,
} from '@/domain/shared/feature-state.js';

function feature(overrides: Partial<Feature> = {}): Feature {
  return {
    id: 'feat-1',
    name: 'Feature',
    slug: 'feature',
    description: '',
    userQuery: '',
    repositoryPath: '/repo',
    branch: 'feat/x',
    lifecycle: SdlcLifecycle.Implementation,
    messages: [],
    relatedArtifacts: [],
    buildMode: BuildMode.Application,
    fast: false,
    push: false,
    openPr: false,
    forkAndPr: false,
    commitSpecs: true,
    ciWatchEnabled: true,
    enableEvidence: false,
    injectSkills: false,
    commitEvidence: false,
    approvalGates: { allowPrd: false, allowPlan: false, allowMerge: false },
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function run(status: AgentRunStatus, overrides: Partial<AgentRun> = {}): AgentRun {
  return {
    id: 'run-1',
    agentType: AgentType.ClaudeCode,
    agentName: 'feature-agent',
    status,
    prompt: '',
    threadId: 'thread-1',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('explainFeatureState', () => {
  const withTasks = (states: TaskState[]) =>
    feature({
      plan: {
        tasks: states.map((state, i) => ({ id: `t${i}`, title: '', description: '', state })),
      } as unknown as Feature['plan'],
    });

  it.each<[string, Feature, AgentRun | null, FeatureState, FeatureStateReason]>([
    [
      'deleting',
      feature({ lifecycle: SdlcLifecycle.Deleting }),
      run(AgentRunStatus.running),
      FeatureState.Deleting,
      FeatureStateReason.Deleting,
    ],
    [
      'archived',
      feature({ lifecycle: SdlcLifecycle.Archived }),
      null,
      FeatureState.Archived,
      FeatureStateReason.Archived,
    ],
    [
      'queued',
      feature({ lifecycle: SdlcLifecycle.Pending, queuedAt: new Date() }),
      null,
      FeatureState.Queued,
      FeatureStateReason.QueuedForCapacity,
    ],
    [
      'deferred',
      feature({ lifecycle: SdlcLifecycle.Pending }),
      null,
      FeatureState.Pending,
      FeatureStateReason.Deferred,
    ],
    [
      'parent',
      feature({ lifecycle: SdlcLifecycle.Blocked }),
      null,
      FeatureState.Blocked,
      FeatureStateReason.WaitingOnParent,
    ],
    [
      'gate',
      feature(),
      run(AgentRunStatus.waitingApproval),
      FeatureState.ActionRequired,
      FeatureStateReason.ApprovalGate,
    ],
    [
      'failed',
      feature(),
      run(AgentRunStatus.failed),
      FeatureState.Error,
      FeatureStateReason.RunFailed,
    ],
    [
      'interrupted',
      feature(),
      run(AgentRunStatus.interrupted),
      FeatureState.Error,
      FeatureStateReason.RunInterrupted,
    ],
    [
      'cancelled',
      feature(),
      run(AgentRunStatus.cancelled),
      FeatureState.Error,
      FeatureStateReason.RunCancelled,
    ],
    [
      'completed',
      feature(),
      run(AgentRunStatus.completed),
      FeatureState.Done,
      FeatureStateReason.RunCompleted,
    ],
    [
      'running',
      feature(),
      run(AgentRunStatus.running),
      FeatureState.Running,
      FeatureStateReason.AgentRunning,
    ],
    [
      'pending run',
      feature(),
      run(AgentRunStatus.pending),
      FeatureState.Running,
      FeatureStateReason.AgentRunning,
    ],
    [
      'maintain',
      feature({ lifecycle: SdlcLifecycle.Maintain }),
      null,
      FeatureState.Done,
      FeatureStateReason.Maintained,
    ],
    [
      'review',
      feature({ lifecycle: SdlcLifecycle.Review }),
      null,
      FeatureState.ActionRequired,
      FeatureStateReason.AwaitingReview,
    ],
    [
      'task in review',
      withTasks([TaskState.Review, TaskState.Done]),
      null,
      FeatureState.ActionRequired,
      FeatureStateReason.PlanTaskInReview,
    ],
    [
      'tasks done',
      withTasks([TaskState.Done]),
      null,
      FeatureState.Done,
      FeatureStateReason.PlanTasksDone,
    ],
    [
      'tasks open',
      withTasks([TaskState.WIP]),
      null,
      FeatureState.Running,
      FeatureStateReason.InProgress,
    ],
    ['no tasks', feature(), null, FeatureState.Running, FeatureStateReason.InProgress],
  ])('%s', (_label, f, r, state, reason) => {
    expect(explainFeatureState(f, r)).toEqual({ state, reason });
  });

  it('an executing run whose process died says so', () => {
    expect(
      explainFeatureState(feature(), run(AgentRunStatus.running), { isPidAlive: false })
    ).toEqual({ state: FeatureState.Error, reason: FeatureStateReason.ProcessDied });
  });

  it('deriveFeatureState is the state of the explanation', () => {
    const f = feature({ lifecycle: SdlcLifecycle.Review });
    expect(deriveFeatureState(f, null)).toBe(explainFeatureState(f, null).state);
  });
});

describe('deriveFeatureState', () => {
  describe('lifecycle takes priority over the run', () => {
    it.each([
      [SdlcLifecycle.Deleting, FeatureState.Deleting],
      [SdlcLifecycle.Archived, FeatureState.Archived],
      [SdlcLifecycle.Blocked, FeatureState.Blocked],
      [SdlcLifecycle.Pending, FeatureState.Pending],
    ])('%s -> %s even while a run is executing', (lifecycle, expected) => {
      expect(deriveFeatureState(feature({ lifecycle }), run(AgentRunStatus.running))).toBe(
        expected
      );
    });

    it('a Pending feature waiting on a capacity slot is Queued, not Pending', () => {
      const queued = feature({ lifecycle: SdlcLifecycle.Pending, queuedAt: new Date() });
      expect(deriveFeatureState(queued, null)).toBe(FeatureState.Queued);
    });
  });

  describe('run status', () => {
    it.each([
      [AgentRunStatus.waitingApproval, FeatureState.ActionRequired],
      [AgentRunStatus.failed, FeatureState.Error],
      [AgentRunStatus.interrupted, FeatureState.Error],
      [AgentRunStatus.cancelled, FeatureState.Error],
      [AgentRunStatus.completed, FeatureState.Done],
      [AgentRunStatus.running, FeatureState.Running],
      [AgentRunStatus.pending, FeatureState.Running],
    ])('%s -> %s', (status, expected) => {
      expect(deriveFeatureState(feature(), run(status))).toBe(expected);
    });

    it('an executing run whose process is dead is an Error', () => {
      expect(
        deriveFeatureState(feature(), run(AgentRunStatus.running), { isPidAlive: false })
      ).toBe(FeatureState.Error);
    });

    it('an unknown PID liveness leaves an executing run Running', () => {
      expect(deriveFeatureState(feature(), run(AgentRunStatus.running), {})).toBe(
        FeatureState.Running
      );
    });
  });

  describe('without a run', () => {
    it('Maintain is Done', () => {
      expect(deriveFeatureState(feature({ lifecycle: SdlcLifecycle.Maintain }), null)).toBe(
        FeatureState.Done
      );
    });

    it('Review (an adopted branch with a PR) needs the user', () => {
      expect(deriveFeatureState(feature({ lifecycle: SdlcLifecycle.Review }), null)).toBe(
        FeatureState.ActionRequired
      );
    });

    it('falls back to plan tasks', () => {
      const withTasks = (states: TaskState[]) =>
        feature({
          plan: {
            tasks: states.map((state, i) => ({ id: `t${i}`, title: '', description: '', state })),
          } as unknown as Feature['plan'],
        });

      expect(deriveFeatureState(withTasks([TaskState.Review, TaskState.Done]), null)).toBe(
        FeatureState.ActionRequired
      );
      expect(deriveFeatureState(withTasks([TaskState.WIP, TaskState.Todo]), null)).toBe(
        FeatureState.Running
      );
      expect(deriveFeatureState(withTasks([TaskState.Done, TaskState.Done]), null)).toBe(
        FeatureState.Done
      );
      expect(deriveFeatureState(withTasks([TaskState.Todo]), null)).toBe(FeatureState.Running);
    });

    it('no plan and no run reads as Running (the agent is about to start)', () => {
      expect(deriveFeatureState(feature(), null)).toBe(FeatureState.Running);
    });
  });
});

describe('agentNodeOf / featurePhaseOf', () => {
  it('reads the graph node from a run result', () => {
    expect(agentNodeOf(run(AgentRunStatus.running, { result: 'node:plan' }))).toBe('plan');
  });

  it('ignores a result that is not a node marker', () => {
    expect(agentNodeOf(run(AgentRunStatus.completed, { result: 'done' }))).toBeUndefined();
    expect(agentNodeOf(null)).toBeUndefined();
  });

  it('prefers the run node, then the lifecycle node', () => {
    expect(
      featurePhaseOf(feature(), run(AgentRunStatus.running, { result: 'node:research' }))
    ).toBe('research');
    expect(featurePhaseOf(feature({ lifecycle: SdlcLifecycle.Planning }), null)).toBe('plan');
  });
});

describe('availableFeatureActions', () => {
  it.each([
    [AgentRunStatus.waitingApproval, [FeatureConsoleAction.Approve, FeatureConsoleAction.Reject]],
    [AgentRunStatus.running, [FeatureConsoleAction.Stop]],
    [AgentRunStatus.pending, [FeatureConsoleAction.Stop]],
    [AgentRunStatus.interrupted, [FeatureConsoleAction.Resume]],
    [AgentRunStatus.failed, [FeatureConsoleAction.Resume]],
    [AgentRunStatus.completed, []],
    [AgentRunStatus.cancelled, []],
  ])('%s offers %j', (status, expected) => {
    expect(availableFeatureActions(run(status))).toEqual(expected);
  });

  it('offers nothing without a run', () => {
    expect(availableFeatureActions(null)).toEqual([]);
  });
});

describe('needsUserAttention', () => {
  it('is true at a gate or with a pending question, false otherwise', () => {
    expect(needsUserAttention(FeatureState.ActionRequired, 0)).toBe(true);
    expect(needsUserAttention(FeatureState.Running, 2)).toBe(true);
    expect(needsUserAttention(FeatureState.Running, 0)).toBe(false);
    expect(needsUserAttention(FeatureState.Done, 0)).toBe(false);
  });
});

describe('compareConsoleRows', () => {
  const row = (
    state: FeatureState,
    needsAttention: boolean,
    updatedAt: string,
    name: string = state
  ) => ({
    name,
    state,
    needsAttention,
    updatedAt: new Date(updatedAt),
  });

  it('orders needs-you, running, waiting, failed, then done; newest first within a group', () => {
    const rows = [
      row(FeatureState.Done, false, '2026-01-05'),
      row(FeatureState.Error, false, '2026-01-04'),
      row(FeatureState.Running, false, '2026-01-01', 'old-running'),
      row(FeatureState.Queued, false, '2026-01-03'),
      row(FeatureState.ActionRequired, true, '2026-01-02'),
      row(FeatureState.Running, false, '2026-01-06', 'new-running'),
      row(FeatureState.Running, true, '2026-01-01', 'running-with-question'),
      row(FeatureState.Archived, false, '2026-01-07'),
    ];

    expect([...rows].sort(compareConsoleRows).map((r) => r.name)).toEqual([
      'action-required',
      'running-with-question',
      'new-running',
      'old-running',
      'queued',
      'error',
      'done',
      'archived',
    ]);
  });
});

describe('isActiveFeatureState (spec 146)', () => {
  it('counts every state that can still change as active', () => {
    const active = Object.values(FeatureState).filter(isActiveFeatureState);
    expect(active.sort()).toEqual(
      [
        FeatureState.ActionRequired,
        FeatureState.Blocked,
        FeatureState.Error,
        FeatureState.Pending,
        FeatureState.Queued,
        FeatureState.Running,
      ].sort()
    );
  });
});
