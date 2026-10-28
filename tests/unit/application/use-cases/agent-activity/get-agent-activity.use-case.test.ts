/**
 * GetAgentActivityUseCase (spec 149): activities projected from the console
 * snapshot, filtered by feature and repository, with counts and the overall
 * state. TDD: RED-GREEN-REFACTOR.
 */

import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { GetAgentActivityUseCase } from '@/application/use-cases/agent-activity/get-agent-activity.use-case.js';
import type {
  FeatureConsoleRow,
  FeatureConsoleSnapshot,
} from '@/application/use-cases/feature-console/feature-console.types.js';
import {
  AgentActivityState,
  AgentRunStatus,
  FeatureConsoleAction,
  FeatureState,
  FeatureStateReason,
  SdlcLifecycle,
} from '@/domain/generated/output.js';
import {
  HEALTHY_FLEET,
  consoleRow,
  consoleSummary,
} from '@tests/helpers/feature-console-fixtures.js';

const NOW = new Date('2026-10-26T12:00:00Z');

function row(featureId: string, overrides: Partial<FeatureConsoleRow> = {}): FeatureConsoleRow {
  return consoleRow({
    featureId,
    shortId: featureId.slice(0, 8),
    name: `Feature ${featureId}`,
    branch: `feat/${featureId}`,
    runId: `run-${featureId}`,
    version: 1000,
    updatedAt: NOW,
    ...overrides,
  });
}

const doneRow = (id: string) =>
  row(id, {
    state: FeatureState.Done,
    stateReason: FeatureStateReason.RunCompleted,
    activity: AgentActivityState.Done,
    activityReason: FeatureStateReason.RunCompleted,
    runStatus: AgentRunStatus.completed,
    actions: [],
  });

describe('GetAgentActivityUseCase', () => {
  let rows: FeatureConsoleRow[];
  let snapshot: { execute: ReturnType<typeof vi.fn> };
  let useCase: GetAgentActivityUseCase;

  beforeEach(() => {
    rows = [];
    snapshot = {
      execute: vi.fn(
        async (): Promise<FeatureConsoleSnapshot> => ({
          generatedAt: NOW,
          rows,
          summary: consoleSummary({ total: rows.length }),
          fleet: HEALTHY_FLEET,
        })
      ),
    };
    useCase = new GetAgentActivityUseCase(snapshot as never);
  });

  it('projects each row into an activity', async () => {
    rows = [
      row('feature-1', {
        activity: AgentActivityState.Blocked,
        activityReason: FeatureStateReason.AgentQuestion,
        pendingQuestions: 1,
        pendingQuestion: { id: 'q1', appId: 'app', prompt: 'Which DB?' },
        error: undefined,
      }),
    ];

    const result = await useCase.execute();

    expect(result.notFound).toBe(false);
    expect(result.generatedAt).toEqual(NOW);
    expect(result.activities).toEqual([
      {
        featureId: 'feature-1',
        shortId: 'feature-',
        name: 'Feature feature-1',
        repositoryPath: '/work/acme',
        branch: 'feat/feature-1',
        state: AgentActivityState.Blocked,
        reason: FeatureStateReason.AgentQuestion,
        featureState: FeatureState.Running,
        lifecycle: SdlcLifecycle.Implementation,
        phase: 'implement',
        runId: 'run-feature-1',
        runStatus: AgentRunStatus.running,
        pendingQuestions: 1,
        pendingQuestion: { id: 'q1', appId: 'app', prompt: 'Which DB?' },
        actions: [FeatureConsoleAction.Stop],
        version: 1000,
        updatedAt: NOW,
      },
    ]);
  });

  it('leaves done features out of a list unless asked, and counts what it returns', async () => {
    rows = [row('a'), doneRow('b')];

    const list = await useCase.execute();
    expect(list.activities.map((a) => a.featureId)).toEqual(['a']);
    expect(list.counts[AgentActivityState.Working]).toBe(1);
    expect(list.counts[AgentActivityState.Done]).toBe(0);
    expect(list.overall).toBe(AgentActivityState.Working);

    const all = await useCase.execute({ includeSettled: true });
    expect(all.activities.map((a) => a.featureId)).toEqual(['a', 'b']);
    expect(all.counts[AgentActivityState.Done]).toBe(1);
  });

  it('lists the most urgent first: blocked, working, waiting, failed, done — snapshot order within a state', async () => {
    const as = (id: string, activity: AgentActivityState) => row(id, { activity });
    rows = [
      doneRow('done-1'),
      as('waiting-1', AgentActivityState.Waiting),
      as('failed-1', AgentActivityState.Failed),
      as('working-1', AgentActivityState.Working),
      as('blocked-1', AgentActivityState.Blocked),
      as('waiting-2', AgentActivityState.Waiting),
      as('blocked-2', AgentActivityState.Blocked),
    ];

    const list = await useCase.execute({ includeSettled: true });

    expect(list.activities.map((a) => a.featureId)).toEqual([
      'blocked-1',
      'blocked-2',
      'working-1',
      'waiting-1',
      'waiting-2',
      'failed-1',
      'done-1',
    ]);
  });

  it('finds one feature by id or prefix, done or archived, and reads archived features to do so', async () => {
    rows = [doneRow('abcdef12-0000'), row('zzz')];

    const exact = await useCase.execute({ featureId: 'abcdef12-0000' });
    expect(exact.activities.map((a) => a.featureId)).toEqual(['abcdef12-0000']);
    expect(snapshot.execute).toHaveBeenLastCalledWith({ includeArchived: true });

    const byPrefix = await useCase.execute({ featureId: 'abcd' });
    expect(byPrefix.activities.map((a) => a.featureId)).toEqual(['abcdef12-0000']);
  });

  it('prefers an exact id over other features sharing it as a prefix', async () => {
    rows = [row('abc'), row('abcd')];
    const result = await useCase.execute({ featureId: 'abc' });
    expect(result.activities.map((a) => a.featureId)).toEqual(['abc']);
  });

  it('reports a feature it cannot find', async () => {
    rows = [row('a')];
    const result = await useCase.execute({ featureId: 'nope' });
    expect(result.notFound).toBe(true);
    expect(result.activities).toEqual([]);
    expect(result.overall).toBe(AgentActivityState.Done);
  });

  it('scopes to a repository', async () => {
    await useCase.execute({ repositoryPath: '/work/acme' });
    expect(snapshot.execute).toHaveBeenCalledWith({ repositoryPath: '/work/acme' });
  });
});
