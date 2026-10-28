/**
 * WatchAgentActivityUseCase and WaitForAgentActivityUseCase (spec 149).
 *
 * Watch polls the activity and yields only what changed, with versions that
 * never go down. Wait returns as soon as a feature reaches an awaited state.
 * TDD: RED-GREEN-REFACTOR.
 */

import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { WatchAgentActivityUseCase } from '@/application/use-cases/agent-activity/watch-agent-activity.use-case.js';
import { WaitForAgentActivityUseCase } from '@/application/use-cases/agent-activity/wait-for-agent-activity.use-case.js';
import type {
  AgentActivity,
  AgentActivityChange,
  GetAgentActivityInput,
  GetAgentActivityResult,
} from '@/application/use-cases/agent-activity/agent-activity.types.js';
import {
  ActivityWaitOutcome,
  AgentActivityState,
  FeatureState,
  FeatureStateReason,
  SdlcLifecycle,
} from '@/domain/generated/output.js';

const TICK_MS = 2;

function activity(featureId: string, overrides: Partial<AgentActivity> = {}): AgentActivity {
  return {
    featureId,
    shortId: featureId,
    name: featureId,
    repositoryPath: '/work/acme',
    branch: `feat/${featureId}`,
    state: AgentActivityState.Working,
    reason: FeatureStateReason.AgentRunning,
    featureState: FeatureState.Running,
    lifecycle: SdlcLifecycle.Implementation,
    phase: 'implement',
    pendingQuestions: 0,
    actions: [],
    version: 100,
    updatedAt: new Date(0),
    ...overrides,
  };
}

const blocked = (featureId: string, version: number) =>
  activity(featureId, {
    state: AgentActivityState.Blocked,
    reason: FeatureStateReason.ApprovalGate,
    featureState: FeatureState.ActionRequired,
    version,
  });

/** A GetAgentActivityUseCase double that serves one list per call, repeating the last. */
function scripted(ticks: AgentActivity[][]) {
  let call = 0;
  const execute = vi.fn(async (input: GetAgentActivityInput = {}) => {
    const all = ticks[Math.min(call, ticks.length - 1)];
    call += 1;
    const activities = input.featureId
      ? all.filter((a) => a.featureId.startsWith(input.featureId as string))
      : all;
    return {
      generatedAt: new Date(0),
      activities,
      counts: {} as GetAgentActivityResult['counts'],
      overall: AgentActivityState.Done,
      notFound: input.featureId !== undefined && activities.length === 0,
    } satisfies GetAgentActivityResult;
  });
  return { execute };
}

async function collect(
  iterable: AsyncIterable<AgentActivityChange>,
  count: number
): Promise<AgentActivityChange[]> {
  const changes: AgentActivityChange[] = [];
  for await (const change of iterable) {
    changes.push(change);
    if (changes.length === count) break;
  }
  return changes;
}

describe('WatchAgentActivityUseCase', () => {
  it('yields every activity first, then only features whose activity changed', async () => {
    const get = scripted([
      [activity('a'), activity('b')],
      [activity('a'), activity('b')],
      [activity('a'), blocked('b', 200)],
    ]);
    const watch = new WatchAgentActivityUseCase(get as never);

    const changes = await collect(watch.watch({ intervalMs: TICK_MS }), 3);

    expect(changes.map((c) => [c.activity.featureId, c.activity.state])).toEqual([
      ['a', AgentActivityState.Working],
      ['b', AgentActivityState.Working],
      ['b', AgentActivityState.Blocked],
    ]);
    expect(changes[2].previous).toEqual({
      state: AgentActivityState.Working,
      reason: FeatureStateReason.AgentRunning,
    });
    expect(get.execute).toHaveBeenCalledWith(expect.objectContaining({ includeSettled: true }));
  });

  it('a new open question, a phase move or a run change counts as a change', async () => {
    const get = scripted([
      [activity('a')],
      [activity('a', { phase: 'plan' })],
      [activity('a', { phase: 'plan', pendingQuestion: { id: 'q', prompt: '?' } })],
    ]);
    const watch = new WatchAgentActivityUseCase(get as never);

    const changes = await collect(watch.watch({ intervalMs: TICK_MS }), 3);

    expect(changes.map((c) => c.activity.phase)).toEqual(['implement', 'plan', 'plan']);
  });

  it('never yields a version lower than or equal to the last one it yielded', async () => {
    const get = scripted([[activity('a', { version: 500 })], [blocked('a', 400)]]);
    const watch = new WatchAgentActivityUseCase(get as never);

    const [first, second] = await collect(watch.watch({ intervalMs: TICK_MS }), 2);

    expect(first.version).toBe(500);
    expect(second.version).toBe(501);
    expect(second.activity.version).toBe(501);
  });

  it('leaves done features out of the first listing unless asked, but reports a feature finishing', async () => {
    const done = activity('d', { state: AgentActivityState.Done });
    const get = scripted([
      [activity('a'), done],
      [activity('a', { state: AgentActivityState.Done })],
    ]);
    const watch = new WatchAgentActivityUseCase(get as never);

    const changes = await collect(watch.watch({ intervalMs: TICK_MS }), 2);

    expect(changes.map((c) => [c.activity.featureId, c.activity.state])).toEqual([
      ['a', AgentActivityState.Working],
      ['a', AgentActivityState.Done],
    ]);
  });

  it('stops when the signal aborts', async () => {
    const get = scripted([[activity('a')]]);
    const watch = new WatchAgentActivityUseCase(get as never);
    const controller = new AbortController();

    const changes: AgentActivityChange[] = [];
    for await (const change of watch.watch({ intervalMs: TICK_MS, signal: controller.signal })) {
      changes.push(change);
      controller.abort();
    }

    expect(changes).toHaveLength(1);
  });
});

describe('WaitForAgentActivityUseCase', () => {
  let ticks: AgentActivity[][];
  let useCase: WaitForAgentActivityUseCase;

  beforeEach(() => {
    ticks = [];
  });

  function build(): WaitForAgentActivityUseCase {
    const get = scripted(ticks);
    return new WaitForAgentActivityUseCase(
      get as never,
      new WatchAgentActivityUseCase(get as never)
    );
  }

  it('returns at once when the feature already matches, by default blocked/done/failed', async () => {
    ticks = [[blocked('f1', 10)]];
    useCase = build();

    const result = await useCase.execute({ featureId: 'f1', intervalMs: TICK_MS });

    expect(result.outcome).toBe(ActivityWaitOutcome.Matched);
    expect(result.activity?.state).toBe(AgentActivityState.Blocked);
  });

  it('waits until the feature reaches an awaited state', async () => {
    ticks = [
      [activity('f1')],
      [activity('f1')],
      [activity('f1', { state: AgentActivityState.Done })],
    ];
    useCase = build();

    const result = await useCase.execute({
      featureId: 'f1',
      until: [AgentActivityState.Done],
      intervalMs: TICK_MS,
    });

    expect(result).toMatchObject({
      outcome: ActivityWaitOutcome.Matched,
      activity: { state: AgentActivityState.Done },
    });
  });

  it('times out with the last activity it saw', async () => {
    ticks = [[activity('f1')]];
    useCase = build();

    const result = await useCase.execute({ featureId: 'f1', timeoutMs: 20, intervalMs: TICK_MS });

    expect(result.outcome).toBe(ActivityWaitOutcome.TimedOut);
    expect(result.activity?.state).toBe(AgentActivityState.Working);
  });

  it('reports a missing feature and an ambiguous prefix without waiting', async () => {
    ticks = [[activity('abc1'), activity('abc2')]];
    useCase = build();

    expect((await useCase.execute({ featureId: 'zzz' })).outcome).toBe(
      ActivityWaitOutcome.NotFound
    );
    expect((await useCase.execute({ featureId: 'abc' })).outcome).toBe(
      ActivityWaitOutcome.Ambiguous
    );
  });

  it('reports an abort by the caller', async () => {
    ticks = [[activity('f1')]];
    useCase = build();
    const controller = new AbortController();
    setTimeout(() => controller.abort(), 10);

    const result = await useCase.execute({
      featureId: 'f1',
      intervalMs: TICK_MS,
      signal: controller.signal,
    });

    expect(result.outcome).toBe(ActivityWaitOutcome.Aborted);
  });
});
