// @vitest-environment node

/** DeleteFeatureCheckpointsUseCase (spec 135). */

import 'reflect-metadata';
import { describe, it, expect, vi } from 'vitest';
import { DeleteFeatureCheckpointsUseCase } from '@/application/use-cases/features/checkpoints/delete-feature-checkpoints.use-case.js';
import { CaptureFeatureCheckpointUseCase } from '@/application/use-cases/features/checkpoints/capture-feature-checkpoint.use-case.js';
import {
  createFakeGitCheckpointRepository,
  createMockGitCheckpointService,
} from '../../../../../helpers/git-checkpoint.fakes.js';

const FEATURE_ID = '3f0c1d2e-4b5a-4c6d-8e7f-001122334455';
const createLogger = () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() });

describe('DeleteFeatureCheckpointsUseCase', () => {
  it("deletes the feature's refs from the repository, then its rows", async () => {
    const repo = createFakeGitCheckpointRepository();
    const git = createMockGitCheckpointService();
    await new CaptureFeatureCheckpointUseCase(git, repo, { now: () => new Date() }).ensureBaseline({
      featureId: FEATURE_ID,
      worktreePath: '/wt',
    });
    git.deleteRefs.mockResolvedValue(1);

    const deleted = await new DeleteFeatureCheckpointsUseCase(repo, git, createLogger()).execute({
      featureId: FEATURE_ID,
      repositoryPath: '/repo',
    });

    expect(deleted).toBe(1);
    expect(git.deleteRefs).toHaveBeenCalledWith('/repo', `refs/shep/checkpoints/${FEATURE_ID}/`);
    expect(repo.rows).toEqual([]);
    expect(git.deleteRefs.mock.invocationCallOrder[0]).toBeLessThan(
      repo.deleteByFeatureId.mock.invocationCallOrder[0]
    );
  });

  it('deletes the rows even when the refs could not be deleted, and reports the failure', async () => {
    const repo = createFakeGitCheckpointRepository();
    const git = createMockGitCheckpointService();
    await new CaptureFeatureCheckpointUseCase(git, repo, { now: () => new Date() }).ensureBaseline({
      featureId: FEATURE_ID,
      worktreePath: '/wt',
    });
    git.deleteRefs.mockRejectedValue(new Error('git missing'));

    await expect(
      new DeleteFeatureCheckpointsUseCase(repo, git, createLogger()).execute({
        featureId: FEATURE_ID,
        repositoryPath: '/repo',
      })
    ).rejects.toThrow('git missing');
    // The refs are found by prefix, not through the rows, so a later cleanup can
    // still remove them; stale rows would only list checkpoints that are gone.
    expect(repo.rows).toEqual([]);
  });
});

describe('DeleteFeatureCheckpointsUseCase.executeBestEffort', () => {
  it('logs a failure instead of throwing, for callers whose own work must not fail', async () => {
    const repo = createFakeGitCheckpointRepository();
    const git = createMockGitCheckpointService();
    git.deleteRefs.mockRejectedValue(new Error('git missing'));
    const logger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };

    await expect(
      new DeleteFeatureCheckpointsUseCase(repo, git, logger).executeBestEffort({
        featureId: FEATURE_ID,
        repositoryPath: '/repo',
      })
    ).resolves.toBe(0);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('checkpoint'),
      expect.objectContaining({ featureId: FEATURE_ID, err: 'git missing' })
    );
  });

  it('returns the number of refs deleted on success', async () => {
    const git = createMockGitCheckpointService();
    git.deleteRefs.mockResolvedValue(3);
    const logger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };
    await expect(
      new DeleteFeatureCheckpointsUseCase(
        createFakeGitCheckpointRepository(),
        git,
        logger
      ).executeBestEffort({
        featureId: FEATURE_ID,
        repositoryPath: '/repo',
      })
    ).resolves.toBe(3);
  });
});
