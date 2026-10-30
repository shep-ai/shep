/**
 * Explore Flow (spec 150)
 *
 * Runs the real feature-agent graph with Explore deps wired around the
 * implement node. When Explore keeps an attempt, the implement node's own
 * agent call is skipped and the graph carries on to merge; when Explore keeps
 * nothing (or there is no plan), the implement node runs as before.
 */

import 'reflect-metadata';
import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest';
import { createFeatureAgentGraph } from '@/infrastructure/services/agents/feature-agent/feature-agent-graph.js';
import { createCheckpointer } from '@/infrastructure/services/agents/common/checkpointer.js';
import type { ExploreNodeDeps } from '@/infrastructure/services/agents/feature-agent/explore/with-explore.js';
import { HarnessRecursion, HarnessRefinementStatus } from '@/domain/generated/output.js';
import {
  createStubExecutor,
  createStubMergeNodeDeps,
  createTestContext,
  type StubExecutor,
  type TestContext,
} from './setup.js';
import { ALL_GATES_ENABLED, expectNoInterrupts, getExecutedNodes } from './helpers.js';

const PLAN = {
  k: 1,
  recursion: HarnessRecursion.Parallel,
  maxCostUsd: 20,
  alwaysOnCharCap: 4000,
  featureName: 'Explore flow',
};

const KEPT = {
  status: HarnessRefinementStatus.Proposed,
  refinementRunId: 'r1',
  adopted: true,
  chosenLabel: 'agg1',
  costUsd: 3,
};

const NOTHING_KEPT = {
  status: HarnessRefinementStatus.Failed,
  refinementRunId: 'r2',
  adopted: false,
  costUsd: 1,
};

function exploreDeps(
  plan: typeof PLAN | null,
  result: typeof KEPT | typeof NOTHING_KEPT
): ExploreNodeDeps & { run: ReturnType<typeof vi.fn> } {
  return {
    plan: vi.fn(async () => plan),
    run: vi.fn(async () => result),
    log: vi.fn(),
  };
}

function runGraph(ctx: TestContext, stub: StubExecutor, explore?: ExploreNodeDeps) {
  return createFeatureAgentGraph(
    {
      executor: stub,
      mergeNodeDeps: createStubMergeNodeDeps(),
      ...(explore ? { explore } : {}),
    },
    createCheckpointer(':memory:')
  ).invoke(ctx.initialState(ALL_GATES_ENABLED), ctx.newConfig());
}

describe('Graph State Transitions › Explore', () => {
  let ctx: TestContext;
  let output: { restore: () => void };

  beforeAll(() => {
    ctx = createTestContext({ withMerge: true });
    ctx.init();
    output = ctx.suppressOutput();
  });

  beforeEach(() => ctx.reset());

  afterAll(() => {
    output.restore();
    ctx.cleanup();
  });

  const prompts = (stub: StubExecutor) => stub.execute.mock.calls.map(([p]) => p as string);

  async function baselineCalls(): Promise<number> {
    const plain = createStubExecutor();
    await runGraph(ctx, plain);
    ctx.reset();
    return plain.execute.mock.calls.length;
  }

  it('replaces the implement call with the kept attempt and still reaches merge', async () => {
    const baseline = await baselineCalls();
    const stub = createStubExecutor();
    const explore = exploreDeps(PLAN, KEPT);

    const result = await runGraph(ctx, stub, explore);

    expectNoInterrupts(result);
    expect(explore.run).toHaveBeenCalledTimes(1);
    expect(stub.execute.mock.calls.length).toBeLessThan(baseline);
    expect(getExecutedNodes(prompts(stub))).toEqual([
      'analyze',
      'requirements',
      'research',
      'plan',
      'merge',
    ]);
    expect(result.messages.some((m: string) => m.includes('Explore: kept agg1'))).toBe(true);
  });

  it('runs the implement node as usual when Explore keeps nothing', async () => {
    const baseline = await baselineCalls();
    const stub = createStubExecutor();
    const explore = exploreDeps(PLAN, NOTHING_KEPT);

    await runGraph(ctx, stub, explore);

    expect(explore.run).toHaveBeenCalledTimes(1);
    expect(stub.execute.mock.calls.length).toBe(baseline);
    expect(getExecutedNodes(prompts(stub))).toContain('implement');
  });

  it('never starts Explore when the feature has no plan', async () => {
    const baseline = await baselineCalls();
    const stub = createStubExecutor();
    const explore = exploreDeps(null, KEPT);

    await runGraph(ctx, stub, explore);

    expect(explore.run).not.toHaveBeenCalled();
    expect(stub.execute.mock.calls.length).toBe(baseline);
  });
});
