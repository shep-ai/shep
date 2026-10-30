import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  withExplore,
  type ExploreNodeDeps,
} from '@/infrastructure/services/agents/feature-agent/explore/with-explore.js';
import { HarnessRecursion, HarnessRefinementStatus } from '@/domain/generated/output.js';
import type { FeatureAgentState } from '@/infrastructure/services/agents/feature-agent/state.js';

const PLAN = {
  k: 1,
  recursion: HarnessRecursion.Parallel,
  maxCostUsd: 20,
  alwaysOnCharCap: 4000,
  featureName: 'F',
};

describe('withExplore', () => {
  let specDir: string;
  let state: FeatureAgentState;
  const node = vi.fn(async () => ({ currentNode: 'implement', messages: ['[implement] ran'] }));

  beforeEach(() => {
    specDir = mkdtempSync(join(tmpdir(), 'shep-explore-'));
    writeFileSync(join(specDir, 'feature.yaml'), 'status:\n  completedPhases: []\n');
    state = {
      featureId: 'feat-1',
      specDir,
      worktreePath: '/wt',
      repositoryPath: '/repo',
    } as FeatureAgentState;
    node.mockClear();
  });

  afterEach(() => rmSync(specDir, { recursive: true, force: true }));

  const deps = (plan: typeof PLAN | null, run?: ExploreNodeDeps['run']): ExploreNodeDeps => ({
    plan: vi.fn(async () => plan),
    run: run ?? vi.fn<ExploreNodeDeps['run']>(),
    log: vi.fn(),
  });

  it('runs the node unchanged without explore deps or without a plan', async () => {
    expect(withExplore(node, 'implement')).toBe(node);
    await withExplore(node, 'implement', deps(null))(state);
    expect(node).toHaveBeenCalledTimes(1);
  });

  it('replaces the node when Explore adopted an attempt, and marks the phase complete', async () => {
    const run = vi.fn(async () => ({
      status: HarnessRefinementStatus.Proposed,
      refinementRunId: 'r',
      adopted: true,
      chosenLabel: 'agg1',
      costUsd: 4,
    }));
    const result = await withExplore(node, 'implement', deps(PLAN, run))(state);
    expect(node).not.toHaveBeenCalled();
    expect(result.messages?.[0]).toContain('kept agg1');
    expect(readFileSync(join(specDir, 'feature.yaml'), 'utf8')).toContain('implement');
  });

  it('falls back to the node when nothing was adopted or the refinement threw', async () => {
    const notAdopted = vi.fn(async () => ({
      status: HarnessRefinementStatus.Failed,
      refinementRunId: 'r',
      adopted: false,
      costUsd: 1,
    }));
    await withExplore(node, 'implement', deps(PLAN, notAdopted))(state);
    const throws = vi.fn(async () => {
      throw new Error('probe failed');
    });
    await withExplore(node, 'implement', deps(PLAN, throws))(state);
    expect(node).toHaveBeenCalledTimes(2);
  });

  it('does not explore again on a rejection rework', async () => {
    const d = deps(PLAN);
    await withExplore(node, 'implement', d)({ ...state, _needsReexecution: true });
    expect(d.plan).not.toHaveBeenCalled();
    expect(node).toHaveBeenCalled();
  });
});
