// @vitest-environment node

/**
 * CaptureFeatureCheckpointUseCase (spec 138).
 *
 * TDD Phase: RED → GREEN
 */

import 'reflect-metadata';
import { describe, it, expect, beforeEach } from 'vitest';
import { CaptureFeatureCheckpointUseCase } from '@/application/use-cases/features/checkpoints/capture-feature-checkpoint.use-case.js';
import { GitCheckpointKind } from '@/domain/generated/output.js';
import {
  createFakeGitCheckpointRepository,
  createMockGitCheckpointService,
  type FakeGitCheckpointRepository,
  type MockGitCheckpointService,
} from '../../../../../helpers/git-checkpoint.fakes.js';

const FEATURE_ID = '3f0c1d2e-4b5a-4c6d-8e7f-001122334455';
const WORKTREE = '/repos/app/.wt/feat-x';
const NOW = new Date('2026-10-11T12:00:00Z');

describe('CaptureFeatureCheckpointUseCase', () => {
  let repo: FakeGitCheckpointRepository;
  let git: MockGitCheckpointService;
  let useCase: CaptureFeatureCheckpointUseCase;

  beforeEach(() => {
    repo = createFakeGitCheckpointRepository();
    git = createMockGitCheckpointService();
    useCase = new CaptureFeatureCheckpointUseCase(git, repo, { now: () => NOW });
  });

  describe('ensureBaseline', () => {
    it('captures sequence 0 when the feature has no checkpoints', async () => {
      const baseline = await useCase.ensureBaseline({
        featureId: FEATURE_ID,
        worktreePath: WORKTREE,
        agentRunId: 'run-1',
      });

      expect(baseline).toMatchObject({
        featureId: FEATURE_ID,
        agentRunId: 'run-1',
        sequence: 0,
        kind: GitCheckpointKind.Baseline,
        node: 'baseline',
        ref: `refs/shep/checkpoints/${FEATURE_ID}/0000-baseline`,
        treeSha: 'aaaa0001',
        headSha: 'cafe0001',
        filesChanged: 0,
        additions: 0,
        deletions: 0,
        createdAt: NOW,
      });
      expect(git.commitCheckpoint).toHaveBeenCalledWith(
        expect.objectContaining({
          cwd: WORKTREE,
          treeSha: 'aaaa0001',
          headSha: 'cafe0001',
          ref: baseline!.ref,
        })
      );
      expect(repo.rows).toHaveLength(1);
    });

    it('does nothing when the feature already has checkpoints', async () => {
      await useCase.ensureBaseline({ featureId: FEATURE_ID, worktreePath: WORKTREE });
      git.snapshotWorktree.mockClear();

      expect(
        await useCase.ensureBaseline({ featureId: FEATURE_ID, worktreePath: WORKTREE })
      ).toBeNull();
      expect(git.snapshotWorktree).not.toHaveBeenCalled();
    });
  });

  describe('captureStep', () => {
    it('numbers steps after the baseline and records stats against the previous tree', async () => {
      await useCase.ensureBaseline({ featureId: FEATURE_ID, worktreePath: WORKTREE });
      git.setTree('bbbb0002');

      const step = await useCase.captureStep({
        featureId: FEATURE_ID,
        worktreePath: WORKTREE,
        node: 'implement',
      });

      expect(step).toMatchObject({
        sequence: 1,
        kind: GitCheckpointKind.Step,
        node: 'implement',
        ref: `refs/shep/checkpoints/${FEATURE_ID}/0001-implement`,
        treeSha: 'bbbb0002',
        filesChanged: 2,
        additions: 10,
        deletions: 3,
      });
      expect(git.diffStat).toHaveBeenCalledWith(WORKTREE, 'aaaa0001', 'bbbb0002');
    });

    it('records nothing when the tree equals the latest checkpoint', async () => {
      await useCase.ensureBaseline({ featureId: FEATURE_ID, worktreePath: WORKTREE });

      expect(
        await useCase.captureStep({
          featureId: FEATURE_ID,
          worktreePath: WORKTREE,
          node: 'validate',
        })
      ).toBeNull();
      expect(git.commitCheckpoint).toHaveBeenCalledTimes(1);
      expect(repo.rows).toHaveLength(1);
    });

    it('starts at 1 without a baseline, keeping 0 for the baseline', async () => {
      const step = await useCase.captureStep({
        featureId: FEATURE_ID,
        worktreePath: WORKTREE,
        node: 'fast-implement',
      });
      expect(step?.sequence).toBe(1);
      // nothing to diff against: stats count the files of the tree
      expect(git.diffStat).toHaveBeenCalledWith(WORKTREE, undefined, 'aaaa0001');
    });

    it('rejects an unsafe node name before touching git', async () => {
      await expect(
        useCase.captureStep({
          featureId: FEATURE_ID,
          worktreePath: WORKTREE,
          node: '--upload-pack',
        })
      ).rejects.toThrow(/node name/);
      expect(git.snapshotWorktree).not.toHaveBeenCalled();
    });
  });

  describe('capturePreRestore', () => {
    it('records a pre-restore checkpoint when the worktree changed', async () => {
      await useCase.ensureBaseline({ featureId: FEATURE_ID, worktreePath: WORKTREE });
      git.setTree('cccc0003');

      const pre = await useCase.capturePreRestore({
        featureId: FEATURE_ID,
        worktreePath: WORKTREE,
      });

      expect(pre).toMatchObject({
        sequence: 1,
        kind: GitCheckpointKind.PreRestore,
        node: 'pre-restore',
      });
    });
  });
});
