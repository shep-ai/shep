/**
 * GetFeatureConsoleSnapshotUseCase Unit Tests (spec 142)
 *
 * The snapshot is everything `shep tui` draws, decided in core: each row's
 * state, phase, cost, elapsed time, the actions it offers, whether it needs
 * the user, and the order rows appear in. The console only formats it.
 *
 * TDD Phase: RED-GREEN-REFACTOR
 */

import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { GetFeatureConsoleSnapshotUseCase } from '@/application/use-cases/feature-console/get-feature-console-snapshot.use-case.js';
import {
  AgentActivityState,
  AgentQuestionStatus,
  AgentRunStatus,
  AgentType,
  BuildMode,
  DecisionKind,
  FeatureConsoleAction,
  FeatureState,
  FeatureStateReason,
  PrStatus,
  SdlcLifecycle,
} from '@/domain/generated/output.js';
import type {
  AgentQuestion,
  AgentRun,
  Feature,
  PhaseTiming,
  Repository,
} from '@/domain/generated/output.js';

const NOW = new Date('2026-10-24T12:00:00Z');

function feature(id: string, overrides: Partial<Feature> = {}): Feature {
  return {
    id,
    name: `Feature ${id}`,
    slug: id,
    description: '',
    userQuery: '',
    repositoryPath: '/work/acme',
    branch: `feat/${id}`,
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
    createdAt: new Date('2026-10-24T10:00:00Z'),
    updatedAt: new Date('2026-10-24T11:00:00Z'),
    ...overrides,
  };
}

function run(id: string, status: AgentRunStatus, overrides: Partial<AgentRun> = {}): AgentRun {
  return {
    id,
    agentType: AgentType.ClaudeCode,
    agentName: 'feature-agent',
    status,
    prompt: '',
    threadId: `thread-${id}`,
    modelId: 'claude-opus-5-5',
    startedAt: new Date('2026-10-24T11:00:00Z'),
    createdAt: new Date('2026-10-24T11:00:00Z'),
    updatedAt: new Date('2026-10-24T11:00:00Z'),
    ...overrides,
  };
}

function timing(runId: string, overrides: Partial<PhaseTiming> = {}): PhaseTiming {
  return {
    id: `t-${runId}-${overrides.phase ?? 'requirements'}`,
    agentRunId: runId,
    phase: 'requirements',
    startedAt: new Date('2026-10-24T11:00:00Z'),
    createdAt: new Date('2026-10-24T11:00:00Z'),
    updatedAt: new Date('2026-10-24T11:00:00Z'),
    ...overrides,
  } as PhaseTiming;
}

function question(featureId: string): AgentQuestion {
  return {
    id: `q-${featureId}`,
    featureId,
    agentRunId: 'r',
    status: AgentQuestionStatus.pending,
    createdAt: NOW,
  } as unknown as AgentQuestion;
}

describe('GetFeatureConsoleSnapshotUseCase', () => {
  let features: Feature[];
  let runs: AgentRun[];
  let timings: PhaseTiming[];
  let questions: AgentQuestion[];
  let repositories: Repository[];
  let listFeatures: { execute: ReturnType<typeof vi.fn> };
  let runRepo: { findByIds: ReturnType<typeof vi.fn> };
  let timingRepo: { findByRunIds: ReturnType<typeof vi.fn> };
  let questionInbox: { execute: ReturnType<typeof vi.fn> };
  let repositoryRepo: { list: ReturnType<typeof vi.fn> };
  let fleetOverview: { execute: ReturnType<typeof vi.fn> };
  let useCase: GetFeatureConsoleSnapshotUseCase;

  beforeEach(() => {
    features = [];
    runs = [];
    timings = [];
    questions = [];
    repositories = [];
    listFeatures = { execute: vi.fn(async () => features) };
    runRepo = {
      findByIds: vi.fn(async (ids: readonly string[]) => runs.filter((r) => ids.includes(r.id))),
    };
    timingRepo = {
      findByRunIds: vi.fn(async (ids: readonly string[]) =>
        timings.filter((t) => ids.includes(t.agentRunId))
      ),
    };
    questionInbox = { execute: vi.fn(async () => questions) };
    repositoryRepo = { list: vi.fn(async () => repositories) };
    fleetOverview = { execute: vi.fn(async () => healthyFleet()) };
    useCase = new GetFeatureConsoleSnapshotUseCase(
      listFeatures as never,
      runRepo as never,
      timingRepo as never,
      questionInbox as never,
      repositoryRepo as never,
      { now: () => NOW },
      fleetOverview as never
    );
  });

  it('builds a row from the feature, its current run and the run timings', async () => {
    features = [feature('f1', { agentRunId: 'r1' })];
    runs = [run('r1', AgentRunStatus.running, { result: 'node:implement' })];
    timings = [
      timing('r1', {
        phase: 'requirements',
        durationMs: 60_000n,
        costUsd: 0.25,
        inputTokens: 1000n,
        outputTokens: 200n,
      }),
      timing('r1', {
        phase: 'implement',
        startedAt: new Date('2026-10-24T11:58:00Z'),
        costUsd: 0.5,
        inputTokens: 500n,
        outputTokens: 100n,
      }),
    ];
    repositories = [{ id: 'repo-1', name: 'acme-web', path: '/work/acme' } as Repository];

    const snapshot = await useCase.execute();

    expect(snapshot.generatedAt).toEqual(NOW);
    expect(snapshot.rows).toHaveLength(1);
    expect(snapshot.rows[0]).toMatchObject({
      featureId: 'f1',
      shortId: 'f1',
      name: 'Feature f1',
      repositoryName: 'acme-web',
      branch: 'feat/f1',
      state: FeatureState.Running,
      phase: 'implement',
      agentType: AgentType.ClaudeCode,
      modelId: 'claude-opus-5-5',
      runId: 'r1',
      runStatus: AgentRunStatus.running,
      costUsd: 0.75,
      inputTokens: 1500,
      outputTokens: 300,
      // 60s finished + 2 min still open
      elapsedMs: 180_000,
      pendingQuestions: 0,
      needsAttention: false,
      actions: [FeatureConsoleAction.Stop],
    });
  });

  it('marks a gate as needing the user and offers approve and reject', async () => {
    features = [feature('f1', { agentRunId: 'r1' })];
    runs = [run('r1', AgentRunStatus.waitingApproval, { result: 'node:requirements' })];

    const [row] = (await useCase.execute()).rows;

    expect(row.state).toBe(FeatureState.ActionRequired);
    expect(row.needsAttention).toBe(true);
    expect(row.actions).toEqual([FeatureConsoleAction.Approve, FeatureConsoleAction.Reject]);
  });

  it('a pending question makes a running feature need the user', async () => {
    features = [feature('f1', { agentRunId: 'r1' })];
    runs = [run('r1', AgentRunStatus.running)];
    questions = [question('f1'), question('f1')];

    const [row] = (await useCase.execute()).rows;

    expect(row.pendingQuestions).toBe(2);
    expect(row.needsAttention).toBe(true);
    expect(questionInbox.execute).toHaveBeenCalledWith({ status: AgentQuestionStatus.pending });
  });

  it('does not count the question an approval gate files for itself', async () => {
    // Every gate also files a blocking inbox question mirroring it (spec 093).
    // The run status already says "at a gate"; counting the mirror would call
    // a feature that moved past its gate a "question" until the mirror expires.
    features = [feature('f1', { agentRunId: 'r1' })];
    runs = [run('r1', AgentRunStatus.running)];
    questions = [
      {
        ...question('f1'),
        decision: { id: 'r1', kind: DecisionKind.ApprovalGate, questions: [] },
      } as unknown as AgentQuestion,
    ];

    const [row] = (await useCase.execute()).rows;

    expect(row.pendingQuestions).toBe(0);
    expect(row.needsAttention).toBe(false);
    expect(row.state).toBe(FeatureState.Running);
  });

  it('orders rows needing the user first, then running, then done, and totals them', async () => {
    features = [
      feature('done', {
        agentRunId: 'r-done',
        updatedAt: new Date('2026-10-24T11:59:00Z'),
      }),
      feature('run', { agentRunId: 'r-run' }),
      feature('gate', { agentRunId: 'r-gate', updatedAt: new Date('2026-10-24T09:00:00Z') }),
      feature('fail', { agentRunId: 'r-fail' }),
      feature('queued', { lifecycle: SdlcLifecycle.Pending, queuedAt: NOW }),
    ];
    runs = [
      run('r-done', AgentRunStatus.completed),
      run('r-run', AgentRunStatus.running),
      run('r-gate', AgentRunStatus.waitingApproval),
      run('r-fail', AgentRunStatus.failed, { error: 'boom' }),
    ];

    const snapshot = await useCase.execute();

    expect(snapshot.rows.map((r) => r.featureId)).toEqual([
      'gate',
      'run',
      'queued',
      'fail',
      'done',
    ]);
    expect(snapshot.summary).toEqual({
      total: 5,
      needsAttention: 1,
      running: 1,
      waiting: 1,
      failed: 1,
      done: 1,
      activity: AgentActivityState.Blocked,
    });
    expect(snapshot.rows.find((r) => r.featureId === 'fail')?.error).toBe('boom');
  });

  it('asks the repository for archived features only when told to', async () => {
    await useCase.execute();
    expect(listFeatures.execute).toHaveBeenLastCalledWith(undefined);

    await useCase.execute({ includeArchived: true });
    expect(listFeatures.execute).toHaveBeenLastCalledWith({ includeArchived: true });
  });

  it('scopes the list to a repository when given one', async () => {
    await useCase.execute({ repositoryPath: '/work/acme' });

    expect(listFeatures.execute).toHaveBeenCalledWith({ repositoryPath: '/work/acme' });
  });

  it('reads runs and timings in one batched call each', async () => {
    features = [
      feature('f1', { agentRunId: 'r1' }),
      feature('f2', { agentRunId: 'r2' }),
      feature('f3'),
    ];
    runs = [run('r1', AgentRunStatus.running), run('r2', AgentRunStatus.completed)];

    await useCase.execute();

    expect(runRepo.findByIds).toHaveBeenCalledTimes(1);
    expect(runRepo.findByIds).toHaveBeenCalledWith(['r1', 'r2']);
    expect(timingRepo.findByRunIds).toHaveBeenCalledTimes(1);
  });

  it('falls back to the last path segment when the repository is not registered', async () => {
    features = [feature('f1', { repositoryPath: 'C:\\code\\billing-api' })];

    const [row] = (await useCase.execute()).rows;

    expect(row.repositoryName).toBe('billing-api');
  });

  it('without timings, elapsed runs from the run start to its end or now', async () => {
    features = [feature('f1', { agentRunId: 'r1' }), feature('f2', { agentRunId: 'r2' })];
    runs = [
      run('r1', AgentRunStatus.running, { startedAt: new Date('2026-10-24T11:30:00Z') }),
      run('r2', AgentRunStatus.completed, {
        startedAt: new Date('2026-10-24T10:00:00Z'),
        completedAt: new Date('2026-10-24T10:10:00Z'),
      }),
    ];

    const rows = (await useCase.execute()).rows;

    expect(rows.find((r) => r.featureId === 'f1')?.elapsedMs).toBe(30 * 60_000);
    expect(rows.find((r) => r.featureId === 'f2')?.elapsedMs).toBe(10 * 60_000);
  });

  it('leaves cost undefined when no phase reported one, and carries the PR', async () => {
    features = [
      feature('f1', {
        agentRunId: 'r1',
        pr: { url: 'https://github.com/acme/web/pull/7', number: 7, status: PrStatus.Open },
      }),
    ];
    runs = [run('r1', AgentRunStatus.completed)];
    timings = [timing('r1', { durationMs: 1000n })];

    const [row] = (await useCase.execute()).rows;

    expect(row.costUsd).toBeUndefined();
    expect(row.pr).toEqual({
      number: 7,
      url: 'https://github.com/acme/web/pull/7',
      status: PrStatus.Open,
    });
  });
  describe('agent activity (spec 148)', () => {
    it('a running row is working, with the reason and a version from its newest write', async () => {
      features = [feature('f1', { agentRunId: 'r1', updatedAt: new Date('2026-10-24T11:00:00Z') })];
      runs = [run('r1', AgentRunStatus.running, { updatedAt: new Date('2026-10-24T11:30:00Z') })];

      const [row] = (await useCase.execute()).rows;

      expect(row).toMatchObject({
        stateReason: FeatureStateReason.AgentRunning,
        activity: AgentActivityState.Working,
        activityReason: FeatureStateReason.AgentRunning,
        version: Date.parse('2026-10-24T11:30:00Z'),
      });
      expect(row.pendingQuestion).toBeUndefined();
    });

    it('a gate is blocked at the approval gate', async () => {
      features = [feature('f1', { agentRunId: 'r1' })];
      runs = [run('r1', AgentRunStatus.waitingApproval)];

      const [row] = (await useCase.execute()).rows;

      expect(row.activity).toBe(AgentActivityState.Blocked);
      expect(row.activityReason).toBe(FeatureStateReason.ApprovalGate);
    });

    it('an open question blocks the row and names the oldest question', async () => {
      features = [feature('f1', { agentRunId: 'r1' })];
      runs = [run('r1', AgentRunStatus.running)];
      questions = [
        {
          ...question('f1'),
          id: 'q-new',
          appId: 'app-1',
          prompt: 'Which database?',
          createdAt: new Date('2026-10-24T11:50:00Z'),
        } as unknown as AgentQuestion,
        {
          ...question('f1'),
          id: 'q-old',
          appId: 'app-1',
          prompt: 'Keep the old API?',
          createdAt: new Date('2026-10-24T11:40:00Z'),
        } as unknown as AgentQuestion,
      ];

      const [row] = (await useCase.execute()).rows;

      expect(row.activity).toBe(AgentActivityState.Blocked);
      expect(row.activityReason).toBe(FeatureStateReason.AgentQuestion);
      expect(row.stateReason).toBe(FeatureStateReason.AgentRunning);
      expect(row.pendingQuestion).toEqual({
        id: 'q-old',
        appId: 'app-1',
        prompt: 'Keep the old API?',
      });
      expect(row.version).toBe(Date.parse('2026-10-24T11:50:00Z'));
    });

    it('sums up the rows in one overall activity', async () => {
      features = [feature('a', { agentRunId: 'ra' }), feature('b', { agentRunId: 'rb' })];
      runs = [run('ra', AgentRunStatus.completed), run('rb', AgentRunStatus.running)];

      const { summary } = await useCase.execute();

      expect(summary.activity).toBe(AgentActivityState.Working);
    });
  });

  describe('GetFeatureConsoleSnapshotUseCase: fleet state (spec 148)', () => {
    it('carries a paused queue with its reason and a real Date', async () => {
      fleetOverview.execute.mockResolvedValue({
        ...healthyFleet(),
        queuePaused: {
          pausedAt: '2026-10-24T11:00:00Z',
          reason: 'Consecutive failure threshold reached (4/4 runs failed in the last 15m)',
        },
        circuitBreakerTripped: true,
        circuitBreakerReason: 'Consecutive failure threshold reached (4/4)',
      });

      const { fleet } = await useCase.execute();

      expect(fleet.queuePause).toEqual({
        pausedAt: new Date('2026-10-24T11:00:00Z'),
        reason: 'Consecutive failure threshold reached (4/4 runs failed in the last 15m)',
      });
      expect(fleet.circuitBreakerTripped).toBe(true);
      expect(fleet.circuitBreakerReason).toBe('Consecutive failure threshold reached (4/4)');
    });

    it('carries a trip with no pause while the queue is still draining', async () => {
      fleetOverview.execute.mockResolvedValue({
        ...healthyFleet(),
        circuitBreakerTripped: true,
        circuitBreakerReason: 'Failure rate threshold exceeded (40% > 25%)',
      });

      const { fleet } = await useCase.execute();

      expect(fleet.queuePause).toBeUndefined();
      expect(fleet.circuitBreakerTripped).toBe(true);
    });

    it('reports a healthy fleet as unpaused and untripped', async () => {
      const { fleet } = await useCase.execute();

      expect(fleet).toEqual({ circuitBreakerTripped: false });
    });

    it('scopes the verdict to the console repository, like fleet status --repo', async () => {
      await useCase.execute({ repositoryPath: '/work/acme' });

      expect(fleetOverview.execute).toHaveBeenCalledWith('/work/acme');
    });

    it('fails the read when the fleet read fails, rather than hiding a pause', async () => {
      fleetOverview.execute.mockRejectedValue(new Error('settings unavailable'));

      await expect(useCase.execute()).rejects.toThrow('settings unavailable');
    });

    it('keeps counting rows when the fleet read succeeds but reports nothing', async () => {
      features = [feature('f1', { agentRunId: 'r1' })];
      runs = [run('r1', AgentRunStatus.running)];

      const snapshot = await useCase.execute();

      expect(snapshot.rows).toHaveLength(1);
      expect(snapshot.summary.running).toBe(1);
    });
  });
});

function healthyFleet() {
  return {
    total: 0,
    cruising: 0,
    queued: 0,
    attentionNeeded: 0,
    failed: 0,
    consecutiveFailures: 0,
    circuitBreakerTripped: false,
  };
}
