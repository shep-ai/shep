// @vitest-environment node

/**
 * RestoreFeatureCheckpointUseCase (spec 135).
 *
 * Restore writes to a working tree, so every refusal is tested: it must never
 * run against the repository's main checkout or while an agent may be writing.
 */

import 'reflect-metadata';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { RestoreFeatureCheckpointUseCase } from '@/application/use-cases/features/checkpoints/restore-feature-checkpoint.use-case.js';
import { CaptureFeatureCheckpointUseCase } from '@/application/use-cases/features/checkpoints/capture-feature-checkpoint.use-case.js';
import { CheckpointRestorePolicy } from '@/application/use-cases/features/checkpoints/checkpoint-restore-policy.js';
import {
  CheckpointRestoreRefusedError,
  GitCheckpointNotFoundError,
} from '@/domain/errors/git-checkpoint-errors.js';
import {
  AgentRunStatus,
  GitCheckpointKind,
  type AgentRun,
  type Feature,
} from '@/domain/generated/output.js';
import {
  createMockFeatureRepository,
  type MockFeatureRepository,
} from '../../../../../helpers/feature-repository.mock.js';
import { createFakeAgentRunRepository } from '../../../../../helpers/agent-run-repository.fake.js';
import {
  createFakeGitCheckpointRepository,
  createMockGitCheckpointService,
  type FakeGitCheckpointRepository,
  type MockGitCheckpointService,
} from '../../../../../helpers/git-checkpoint.fakes.js';

const FEATURE_ID = '3f0c1d2e-4b5a-4c6d-8e7f-001122334455';
const REPO = 'C:\\repos\\app';
const WORKTREE = 'C:/repos/app/.wt/feat-x';

const feature = {
  id: FEATURE_ID,
  name: 'Feature X',
  repositoryPath: REPO,
  worktreePath: WORKTREE,
} as Feature;

function run(status: AgentRunStatus): AgentRun {
  return {
    id: 'run-1',
    featureId: FEATURE_ID,
    status,
    createdAt: new Date(),
    updatedAt: new Date(),
  } as AgentRun;
}

describe('RestoreFeatureCheckpointUseCase', () => {
  let features: MockFeatureRepository;
  let repo: FakeGitCheckpointRepository;
  let git: MockGitCheckpointService;
  let capture: CaptureFeatureCheckpointUseCase;
  let runs: ReturnType<typeof createFakeAgentRunRepository>;
  let useCase: RestoreFeatureCheckpointUseCase;

  beforeEach(async () => {
    features = createMockFeatureRepository({ findById: vi.fn().mockResolvedValue(feature) });
    repo = createFakeGitCheckpointRepository();
    git = createMockGitCheckpointService();
    runs = createFakeAgentRunRepository();
    capture = new CaptureFeatureCheckpointUseCase(git, repo, { now: () => new Date() });
    useCase = new RestoreFeatureCheckpointUseCase(
      features,
      repo,
      git,
      new CheckpointRestorePolicy(git, runs),
      capture
    );

    await capture.ensureBaseline({ featureId: FEATURE_ID, worktreePath: WORKTREE });
    git.setTree('bbbb0002');
    await capture.captureStep({ featureId: FEATURE_ID, worktreePath: WORKTREE, node: 'implement' });
    git.setTree('cccc0003'); // the worktree moved on after the last checkpoint
  });

  it('captures a pre-restore checkpoint, then restores the selected tree in the worktree', async () => {
    const result = await useCase.execute({ featureId: FEATURE_ID, step: 'baseline' });

    expect(result.restored.sequence).toBe(0);
    expect(result.safety).toMatchObject({ sequence: 2, kind: GitCheckpointKind.PreRestore });
    expect(git.restoreWorktree).toHaveBeenCalledWith(WORKTREE, 'aaaa0001');
    const preRestoreOrder = git.commitCheckpoint.mock.invocationCallOrder.at(-1)!;
    expect(preRestoreOrder).toBeLessThan(git.restoreWorktree.mock.invocationCallOrder[0]);
  });

  it('accepts a feature id prefix', async () => {
    features.findById.mockResolvedValue(null);
    features.findByIdPrefix.mockResolvedValue(feature);
    await useCase.execute({ featureId: '3f0c', step: '1' });
    expect(git.restoreWorktree).toHaveBeenCalledWith(WORKTREE, 'bbbb0002');
  });

  it('allows restore while a run waits for approval', async () => {
    runs.seed(run(AgentRunStatus.waitingApproval));
    await expect(useCase.execute({ featureId: FEATURE_ID, step: '1' })).resolves.toBeDefined();
  });

  it.each([AgentRunStatus.running, AgentRunStatus.pending])(
    'refuses while the latest run is %s',
    async (status) => {
      runs.seed(run(status));
      await expect(useCase.execute({ featureId: FEATURE_ID, step: '1' })).rejects.toThrow(
        CheckpointRestoreRefusedError
      );
      expect(git.restoreWorktree).not.toHaveBeenCalled();
    }
  );

  it('refuses a feature without its own worktree', async () => {
    features.findById.mockResolvedValue({ ...feature, worktreePath: undefined });
    await expect(useCase.execute({ featureId: FEATURE_ID, step: '1' })).rejects.toThrow(
      /no worktree of its own/
    );
  });

  it('refuses when the worktree is the repository checkout, however the path is spelled', async () => {
    features.findById.mockResolvedValue({ ...feature, worktreePath: 'c:/Repos/App/' });
    await expect(useCase.execute({ featureId: FEATURE_ID, step: '1' })).rejects.toThrow(
      CheckpointRestoreRefusedError
    );
    expect(git.restoreWorktree).not.toHaveBeenCalled();
  });

  it('refuses when git does not report a linked worktree', async () => {
    git.isLinkedWorktree.mockResolvedValue(false);
    await expect(useCase.execute({ featureId: FEATURE_ID, step: '1' })).rejects.toThrow(
      /linked worktree/
    );
    expect(git.restoreWorktree).not.toHaveBeenCalled();
  });

  it('refuses when the worktree cannot be inspected (removed from disk)', async () => {
    git.isLinkedWorktree.mockRejectedValue(new Error('fatal: not a git repository'));
    await expect(useCase.execute({ featureId: FEATURE_ID, step: '1' })).rejects.toThrow(
      CheckpointRestoreRefusedError
    );
  });

  it('throws for an unknown step without touching git', async () => {
    await expect(useCase.execute({ featureId: FEATURE_ID, step: '42' })).rejects.toThrow(
      GitCheckpointNotFoundError
    );
    expect(git.isLinkedWorktree).not.toHaveBeenCalled();
  });

  it('throws for an unknown feature', async () => {
    features.findById.mockResolvedValue(null);
    await expect(useCase.execute({ featureId: 'nope', step: '1' })).rejects.toThrow(/not found/);
  });
});
