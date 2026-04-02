import { describe, it, expect } from 'vitest';
import {
  SdlcLifecycle,
  TaskState,
  AgentRunStatus,
  AgentType,
  NotificationEventType,
  FeatureMode,
} from '@shepai/core/domain/generated';
import type { Feature, AgentRun } from '@shepai/core/domain/generated';
import {
  deriveNodeState,
  deriveProgress,
  mapEventTypeToState,
  mapPhaseNameToLifecycle,
  sdlcLifecycleMap,
} from '@/components/common/feature-node/derive-feature-state';

function createMinimalFeature(overrides: Partial<Feature> = {}): Feature {
  return {
    id: 'test-id',
    name: 'Test Feature',
    slug: 'test-feature',
    description: 'A test feature',
    userQuery: 'test user query',
    repositoryPath: '/test/repo',
    branch: 'feat/test',
    lifecycle: SdlcLifecycle.Implementation,
    messages: [],
    relatedArtifacts: [],
    mode: FeatureMode.Regular,
    iterationCount: 0,
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

function createMinimalAgentRun(overrides: Partial<AgentRun> = {}): AgentRun {
  return {
    id: 'run-1',
    agentType: AgentType.ClaudeCode,
    agentName: 'feature-agent',
    status: AgentRunStatus.running,
    prompt: 'test prompt',
    threadId: 'thread-1',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('deriveNodeState', () => {
  it('returns deleting for Deleting lifecycle (takes top priority)', () => {
    const feature = createMinimalFeature({ lifecycle: SdlcLifecycle.Deleting });
    // Even with a running agent, Deleting lifecycle takes priority
    const run = createMinimalAgentRun({ status: AgentRunStatus.running });
    expect(deriveNodeState(feature, run)).toBe('deleting');
  });

  it('returns deleting for Deleting lifecycle without agent run', () => {
    const feature = createMinimalFeature({ lifecycle: SdlcLifecycle.Deleting });
    expect(deriveNodeState(feature)).toBe('deleting');
  });

  it('returns archived for Archived lifecycle without agent run', () => {
    const feature = createMinimalFeature({ lifecycle: SdlcLifecycle.Archived });
    expect(deriveNodeState(feature)).toBe('archived');
  });

  it('returns archived for Archived lifecycle even with a running agent run', () => {
    const feature = createMinimalFeature({ lifecycle: SdlcLifecycle.Archived });
    const run = createMinimalAgentRun({ status: AgentRunStatus.running });
    expect(deriveNodeState(feature, run)).toBe('archived');
  });

  it('returns pending for Pending lifecycle (after Deleting, before Blocked)', () => {
    const feature = createMinimalFeature({ lifecycle: SdlcLifecycle.Pending });
    expect(deriveNodeState(feature)).toBe('pending');
  });

  it('returns pending for Pending lifecycle even with an agent run', () => {
    const feature = createMinimalFeature({ lifecycle: SdlcLifecycle.Pending });
    const run = createMinimalAgentRun({ status: AgentRunStatus.pending });
    expect(deriveNodeState(feature, run)).toBe('pending');
  });

  describe('with agent run (primary signal)', () => {
    it('returns action-required when agent is waiting_approval', () => {
      const feature = createMinimalFeature({ lifecycle: SdlcLifecycle.Requirements });
      const run = createMinimalAgentRun({ status: AgentRunStatus.waitingApproval });
      expect(deriveNodeState(feature, run)).toBe('action-required');
    });

    it('returns error when agent failed', () => {
      const feature = createMinimalFeature();
      const run = createMinimalAgentRun({ status: AgentRunStatus.failed });
      expect(deriveNodeState(feature, run)).toBe('error');
    });

    it('returns error when agent interrupted', () => {
      const feature = createMinimalFeature();
      const run = createMinimalAgentRun({ status: AgentRunStatus.interrupted });
      expect(deriveNodeState(feature, run)).toBe('error');
    });

    it('returns error when agent cancelled', () => {
      const feature = createMinimalFeature();
      const run = createMinimalAgentRun({ status: AgentRunStatus.cancelled });
      expect(deriveNodeState(feature, run)).toBe('error');
    });

    it('returns done when agent completed', () => {
      const feature = createMinimalFeature();
      const run = createMinimalAgentRun({ status: AgentRunStatus.completed });
      expect(deriveNodeState(feature, run)).toBe('done');
    });

    it('returns running when agent is running', () => {
      const feature = createMinimalFeature();
      const run = createMinimalAgentRun({ status: AgentRunStatus.running });
      expect(deriveNodeState(feature, run)).toBe('running');
    });

    it('returns running when agent is pending', () => {
      const feature = createMinimalFeature();
      const run = createMinimalAgentRun({ status: AgentRunStatus.pending });
      expect(deriveNodeState(feature, run)).toBe('running');
    });

    it('returns error when agent is running but PID is dead (crashed)', () => {
      const feature = createMinimalFeature();
      const run = createMinimalAgentRun({ status: AgentRunStatus.running, pid: 99999 });
      expect(deriveNodeState(feature, run, { isPidAlive: false })).toBe('error');
    });

    it('returns error when agent is pending but PID is dead (crashed)', () => {
      const feature = createMinimalFeature();
      const run = createMinimalAgentRun({ status: AgentRunStatus.pending, pid: 99999 });
      expect(deriveNodeState(feature, run, { isPidAlive: false })).toBe('error');
    });

    it('returns running when agent is running and PID is alive', () => {
      const feature = createMinimalFeature();
      const run = createMinimalAgentRun({ status: AgentRunStatus.running, pid: 12345 });
      expect(deriveNodeState(feature, run, { isPidAlive: true })).toBe('running');
    });

    it('returns running when no pidAlive info provided (backwards compat)', () => {
      const feature = createMinimalFeature();
      const run = createMinimalAgentRun({ status: AgentRunStatus.running });
      expect(deriveNodeState(feature, run)).toBe('running');
    });
  });

  describe('without agent run (fallback to plan tasks)', () => {
    it('returns done for Maintain lifecycle', () => {
      const feature = createMinimalFeature({ lifecycle: SdlcLifecycle.Maintain });
      expect(deriveNodeState(feature)).toBe('done');
    });

    it('returns action-required for Review lifecycle without agent run (adopted branch with open PR)', () => {
      const feature = createMinimalFeature({ lifecycle: SdlcLifecycle.Review });
      expect(deriveNodeState(feature)).toBe('action-required');
    });

    it('returns running when no plan exists', () => {
      const feature = createMinimalFeature();
      expect(deriveNodeState(feature)).toBe('running');
    });

    it('returns action-required when tasks have Review state', () => {
      const feature = createMinimalFeature({
        plan: {
          id: 'plan-1',
          overview: 'Test plan',
          requirements: [],
          artifacts: [],
          tasks: [
            {
              id: 't1',
              state: TaskState.Review,
              dependsOn: [],
              actionItems: [],
              baseBranch: 'main',
              branch: 'feat/t1',
              createdAt: new Date(),
              updatedAt: new Date(),
            },
          ],
          state: 'Ready' as never,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      });
      expect(deriveNodeState(feature)).toBe('action-required');
    });

    it('returns running when tasks have WIP state', () => {
      const feature = createMinimalFeature({
        plan: {
          id: 'plan-1',
          overview: 'Test plan',
          requirements: [],
          artifacts: [],
          tasks: [
            {
              id: 't1',
              state: TaskState.WIP,
              dependsOn: [],
              actionItems: [],
              baseBranch: 'main',
              branch: 'feat/t1',
              createdAt: new Date(),
              updatedAt: new Date(),
            },
          ],
          state: 'Ready' as never,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      });
      expect(deriveNodeState(feature)).toBe('running');
    });

    it('returns done when all tasks are Done', () => {
      const feature = createMinimalFeature({
        plan: {
          id: 'plan-1',
          overview: 'Test plan',
          requirements: [],
          artifacts: [],
          tasks: [
            {
              id: 't1',
              state: TaskState.Done,
              dependsOn: [],
              actionItems: [],
              baseBranch: 'main',
              branch: 'feat/t1',
              createdAt: new Date(),
              updatedAt: new Date(),
            },
            {
              id: 't2',
              state: TaskState.Done,
              dependsOn: [],
              actionItems: [],
              baseBranch: 'main',
              branch: 'feat/t2',
              createdAt: new Date(),
              updatedAt: new Date(),
            },
          ],
          state: 'Ready' as never,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      });
      expect(deriveNodeState(feature)).toBe('done');
    });
  });
});

describe('deriveProgress', () => {
  it('returns 0 when no plan', () => {
    const feature = createMinimalFeature();
    expect(deriveProgress(feature)).toBe(0);
  });

  it('returns 0 when plan has no tasks', () => {
    const feature = createMinimalFeature({
      plan: {
        id: 'plan-1',
        overview: 'Test plan',
        requirements: [],
        artifacts: [],
        tasks: [],
        state: 'Ready' as never,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });
    expect(deriveProgress(feature)).toBe(0);
  });

  it('returns correct percentage from plan tasks', () => {
    const feature = createMinimalFeature({
      plan: {
        id: 'plan-1',
        overview: 'Test plan',
        requirements: [],
        artifacts: [],
        tasks: [
          {
            id: 't1',
            state: TaskState.Done,
            dependsOn: [],
            actionItems: [],
            baseBranch: 'main',
            branch: 'feat/t1',
            createdAt: new Date(),
            updatedAt: new Date(),
          },
          {
            id: 't2',
            state: TaskState.WIP,
            dependsOn: [],
            actionItems: [],
            baseBranch: 'main',
            branch: 'feat/t2',
            createdAt: new Date(),
            updatedAt: new Date(),
          },
          {
            id: 't3',
            state: TaskState.Todo,
            dependsOn: [],
            actionItems: [],
            baseBranch: 'main',
            branch: 'feat/t3',
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ],
        state: 'Ready' as never,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });
    // 1 done out of 3 = 33%
    expect(deriveProgress(feature)).toBe(33);
  });

  it('returns 100 for Maintain lifecycle', () => {
    const feature = createMinimalFeature({ lifecycle: SdlcLifecycle.Maintain });
    expect(deriveProgress(feature)).toBe(100);
  });
});

describe('mapEventTypeToState', () => {
  it('maps agent_started to running', () => {
    expect(mapEventTypeToState(NotificationEventType.AgentStarted)).toBe('running');
  });

  it('maps phase_completed to running', () => {
    expect(mapEventTypeToState(NotificationEventType.PhaseCompleted)).toBe('running');
  });

  it('maps waiting_approval to action-required', () => {
    expect(mapEventTypeToState(NotificationEventType.WaitingApproval)).toBe('action-required');
  });

  it('maps agent_completed to done', () => {
    expect(mapEventTypeToState(NotificationEventType.AgentCompleted)).toBe('done');
  });

  it('maps agent_failed to error', () => {
    expect(mapEventTypeToState(NotificationEventType.AgentFailed)).toBe('error');
  });

  it('maps pr_blocked to blocked', () => {
    expect(mapEventTypeToState(NotificationEventType.PrBlocked)).toBe('blocked');
  });

  it('maps pr_checks_failed to error', () => {
    expect(mapEventTypeToState(NotificationEventType.PrChecksFailed)).toBe('error');
  });

  it('maps pr_merged to done', () => {
    expect(mapEventTypeToState(NotificationEventType.PrMerged)).toBe('done');
  });

  it('maps pr_closed to action-required', () => {
    expect(mapEventTypeToState(NotificationEventType.PrClosed)).toBe('action-required');
  });
});

describe('mapPhaseNameToLifecycle', () => {
  it('maps "analyze" to requirements', () => {
    expect(mapPhaseNameToLifecycle('analyze')).toBe('requirements');
  });

  it('maps "requirements" to requirements', () => {
    expect(mapPhaseNameToLifecycle('requirements')).toBe('requirements');
  });

  it('maps "research" to research', () => {
    expect(mapPhaseNameToLifecycle('research')).toBe('research');
  });

  it('maps "plan" to implementation', () => {
    expect(mapPhaseNameToLifecycle('plan')).toBe('implementation');
  });

  it('maps "implement" to implementation', () => {
    expect(mapPhaseNameToLifecycle('implement')).toBe('implementation');
  });

  it('maps "pending" to pending', () => {
    expect(mapPhaseNameToLifecycle('pending')).toBe('pending');
  });

  it('returns undefined for undefined input', () => {
    expect(mapPhaseNameToLifecycle(undefined)).toBeUndefined();
  });

  it('returns undefined for unrecognized phaseName', () => {
    expect(mapPhaseNameToLifecycle('unknown_phase')).toBeUndefined();
  });
});

describe('sdlcLifecycleMap', () => {
  it('maps Pending to pending', () => {
    expect(sdlcLifecycleMap['Pending']).toBe('pending');
  });

  it('maps Archived to maintain (closest phase)', () => {
    expect(sdlcLifecycleMap['Archived']).toBe('maintain');
  });
});

describe('mapPhaseNameToLifecycle (archived)', () => {
  it('maps "archived" to maintain', () => {
    expect(mapPhaseNameToLifecycle('archived')).toBe('maintain');
  });
});
