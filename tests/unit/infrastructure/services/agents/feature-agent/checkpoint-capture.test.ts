// @vitest-environment node

/**
 * The worker's CheckpointRecorder (spec 135): routes graph-node events to the
 * capture use case and turns every failure into a log line.
 */

import { describe, it, expect, vi } from 'vitest';
import { createCheckpointRecorder } from '@/infrastructure/services/agents/feature-agent/checkpoint-capture.js';
import type { FeatureAgentState } from '@/infrastructure/services/agents/feature-agent/state.js';

function capture() {
  return {
    ensureBaseline: vi.fn().mockResolvedValue(null),
    captureStep: vi.fn().mockResolvedValue({ sequence: 3, node: 'implement' }),
  };
}

const state = {
  featureId: 'f1',
  worktreePath: '/wt/f1',
  repositoryPath: '/repo',
} as FeatureAgentState;

describe('createCheckpointRecorder', () => {
  it('captures in the worktree with the run id', async () => {
    const uc = capture();
    const recorder = createCheckpointRecorder({ capture: uc, agentRunId: 'run-1', log: vi.fn() });

    await recorder.beforeNode(state);
    await recorder.afterNode('implement', state);

    expect(uc.ensureBaseline).toHaveBeenCalledWith({
      featureId: 'f1',
      worktreePath: '/wt/f1',
      agentRunId: 'run-1',
    });
    expect(uc.captureStep).toHaveBeenCalledWith({
      featureId: 'f1',
      worktreePath: '/wt/f1',
      agentRunId: 'run-1',
      node: 'implement',
    });
  });

  it('falls back to the repository path when the state has no worktree', async () => {
    const uc = capture();
    const recorder = createCheckpointRecorder({ capture: uc, log: vi.fn() });
    await recorder.afterNode('plan', { ...state, worktreePath: '' });
    expect(uc.captureStep).toHaveBeenCalledWith(expect.objectContaining({ worktreePath: '/repo' }));
  });

  it('logs and swallows capture failures', async () => {
    const uc = capture();
    uc.captureStep.mockRejectedValue(new Error('fatal: index.lock exists'));
    uc.ensureBaseline.mockRejectedValue(new Error('fatal: not a git repository'));
    const log = vi.fn();
    const recorder = createCheckpointRecorder({ capture: uc, log });

    await expect(recorder.beforeNode(state)).resolves.toBeUndefined();
    await expect(recorder.afterNode('implement', state)).resolves.toBeUndefined();
    expect(log).toHaveBeenCalledWith(expect.stringContaining('index.lock exists'));
    expect(log).toHaveBeenCalledWith(expect.stringContaining('not a git repository'));
  });

  it('logs the recorded checkpoint', async () => {
    const log = vi.fn();
    const recorder = createCheckpointRecorder({ capture: capture(), log });
    await recorder.afterNode('implement', state);
    expect(log).toHaveBeenCalledWith(expect.stringContaining('0003-implement'));
  });
});
