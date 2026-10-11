// @vitest-environment node

/**
 * withCheckpoint (spec 138): a graph node wrapper that snapshots the worktree
 * around a node without ever changing the node's outcome.
 */

import { describe, it, expect, vi } from 'vitest';
import {
  withCheckpoint,
  type CheckpointRecorder,
} from '@/infrastructure/services/agents/feature-agent/nodes/with-checkpoint.js';
import type { FeatureAgentState } from '@/infrastructure/services/agents/feature-agent/state.js';

const state = {
  featureId: 'f1',
  worktreePath: '/wt',
  repositoryPath: '/repo',
} as FeatureAgentState;

function recorder(): CheckpointRecorder & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    beforeNode: vi.fn(async () => {
      calls.push('before');
    }),
    afterNode: vi.fn(async (node: string) => {
      calls.push(`after:${node}`);
    }),
  };
}

describe('withCheckpoint', () => {
  it('returns the node unchanged without a recorder', () => {
    const node = vi.fn(async () => ({}));
    expect(withCheckpoint('implement', node)).toBe(node);
  });

  it('ensures a baseline before the node and captures after it', async () => {
    const rec = recorder();
    const node = vi.fn(async () => {
      rec.calls.push('node');
      return { messages: ['done'] };
    });

    const result = await withCheckpoint('implement', node, rec)(state);

    expect(result).toEqual({ messages: ['done'] });
    expect(rec.calls).toEqual(['before', 'node', 'after:implement']);
    expect(rec.afterNode).toHaveBeenCalledWith('implement', state);
  });

  it('captures the partial work of a node that throws, then rethrows its error', async () => {
    const rec = recorder();
    const boom = new Error('agent crashed');
    const node = vi.fn(async () => {
      throw boom;
    });

    await expect(withCheckpoint('merge', node, rec)(state)).rejects.toBe(boom);
    expect(rec.calls).toEqual(['before', 'after:merge']);
  });

  it('never lets a failing recorder change the node outcome', async () => {
    const rec: CheckpointRecorder = {
      beforeNode: vi.fn().mockRejectedValue(new Error('git missing')),
      afterNode: vi.fn().mockRejectedValue(new Error('git missing')),
    };
    const node = vi.fn(async () => ({ messages: ['ok'] }));

    await expect(withCheckpoint('plan', node, rec)(state)).resolves.toEqual({ messages: ['ok'] });
    expect(node).toHaveBeenCalledOnce();
  });
});
