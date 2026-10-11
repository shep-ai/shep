// @vitest-environment node

/**
 * CheckpointRestorePolicy (spec 135): the one place that decides whether a
 * feature's worktree may be restored, shared by restore and list.
 */

import 'reflect-metadata';
import { describe, it, expect, beforeEach } from 'vitest';
import { CheckpointRestorePolicy } from '@/application/use-cases/features/checkpoints/checkpoint-restore-policy.js';
import {
  AgentRunStatus,
  CheckpointRestoreBlocker,
  type AgentRun,
  type Feature,
} from '@/domain/generated/output.js';
import { createFakeAgentRunRepository } from '../../../../../helpers/agent-run-repository.fake.js';
import {
  createMockGitCheckpointService,
  type MockGitCheckpointService,
} from '../../../../../helpers/git-checkpoint.fakes.js';

const feature = {
  id: 'f1',
  repositoryPath: 'C:\\repos\\app',
  worktreePath: 'C:/repos/app/.wt/x',
} as Feature;

describe('CheckpointRestorePolicy', () => {
  let git: MockGitCheckpointService;
  let runs: ReturnType<typeof createFakeAgentRunRepository>;
  let policy: CheckpointRestorePolicy;

  beforeEach(() => {
    git = createMockGitCheckpointService();
    runs = createFakeAgentRunRepository();
    policy = new CheckpointRestorePolicy(git, runs);
  });

  it('allows a linked worktree with no running agent', async () => {
    expect(await policy.evaluate(feature)).toEqual({
      allowed: true,
      worktreePath: feature.worktreePath,
    });
  });

  it.each([
    ['no worktree', { worktreePath: undefined }],
    ['the repository checkout, spelled differently', { worktreePath: 'c:/Repos/App/' }],
  ])('blocks %s with NoOwnWorktree', async (_label, overrides) => {
    expect(await policy.evaluate({ ...feature, ...overrides })).toMatchObject({
      allowed: false,
      blocker: CheckpointRestoreBlocker.NoOwnWorktree,
    });
    expect(git.isLinkedWorktree).not.toHaveBeenCalled();
  });

  it('blocks a directory git does not report as a linked worktree', async () => {
    git.isLinkedWorktree.mockResolvedValue(false);
    expect(await policy.evaluate(feature)).toMatchObject({
      blocker: CheckpointRestoreBlocker.NotLinkedWorktree,
    });
  });

  it('blocks a worktree git cannot read', async () => {
    git.isLinkedWorktree.mockRejectedValue(new Error('fatal: not a git repository'));
    expect(await policy.evaluate(feature)).toMatchObject({
      blocker: CheckpointRestoreBlocker.WorktreeUnavailable,
      detail: expect.stringContaining('not a git repository'),
    });
  });

  it.each([AgentRunStatus.pending, AgentRunStatus.running])(
    'blocks while the latest run is %s',
    async (status) => {
      runs.seed({
        id: 'r',
        featureId: 'f1',
        status,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as AgentRun);
      expect(await policy.evaluate(feature)).toMatchObject({
        blocker: CheckpointRestoreBlocker.AgentRunning,
      });
    }
  );
});
