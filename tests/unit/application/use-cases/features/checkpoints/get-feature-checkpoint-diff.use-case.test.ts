// @vitest-environment node

/** GetFeatureCheckpointDiffUseCase and ListFeatureCheckpointsUseCase (spec 135). */

import 'reflect-metadata';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { GetFeatureCheckpointDiffUseCase } from '@/application/use-cases/features/checkpoints/get-feature-checkpoint-diff.use-case.js';
import { ListFeatureCheckpointsUseCase } from '@/application/use-cases/features/checkpoints/list-feature-checkpoints.use-case.js';
import { CaptureFeatureCheckpointUseCase } from '@/application/use-cases/features/checkpoints/capture-feature-checkpoint.use-case.js';
import { GitCheckpointNotFoundError } from '@/domain/errors/git-checkpoint-errors.js';
import type { Feature } from '@/domain/generated/output.js';
import type { FileDiff } from '@/application/ports/output/services/git-pr-service.interface.js';
import {
  createMockFeatureRepository,
  type MockFeatureRepository,
} from '../../../../../helpers/feature-repository.mock.js';
import {
  createFakeGitCheckpointRepository,
  createMockGitCheckpointService,
  type FakeGitCheckpointRepository,
  type MockGitCheckpointService,
} from '../../../../../helpers/git-checkpoint.fakes.js';

const FEATURE_ID = '3f0c1d2e-4b5a-4c6d-8e7f-001122334455';
const feature = {
  id: FEATURE_ID,
  name: 'Feature X',
  repositoryPath: '/repos/app',
  worktreePath: '/repos/app/.wt/x',
} as Feature;

const FILES: FileDiff[] = [
  { path: 'a.ts', status: 'modified', additions: 4, deletions: 1, hunks: [] },
  { path: 'b.ts', status: 'added', additions: 6, deletions: 0, hunks: [] },
];

describe('checkpoint read use cases', () => {
  let features: MockFeatureRepository;
  let repo: FakeGitCheckpointRepository;
  let git: MockGitCheckpointService;

  beforeEach(async () => {
    features = createMockFeatureRepository({ findById: vi.fn().mockResolvedValue(feature) });
    repo = createFakeGitCheckpointRepository();
    git = createMockGitCheckpointService();
    const capture = new CaptureFeatureCheckpointUseCase(git, repo, { now: () => new Date() });
    await capture.ensureBaseline({ featureId: FEATURE_ID, worktreePath: feature.worktreePath! });
    for (const [tree, node] of [
      ['bbbb', 'plan'],
      ['cccc', 'implement'],
      ['dddd', 'repair_research'],
    ]) {
      git.setTree(tree);
      await capture.captureStep({
        featureId: FEATURE_ID,
        worktreePath: feature.worktreePath!,
        node,
      });
    }
    git.diff.mockResolvedValue(FILES);
  });

  describe('ListFeatureCheckpointsUseCase', () => {
    it('returns the feature and its checkpoints in order', async () => {
      const result = await new ListFeatureCheckpointsUseCase(features, repo).execute(FEATURE_ID);
      expect(result.featureId).toBe(FEATURE_ID);
      expect(result.featureName).toBe('Feature X');
      expect(result.checkpoints.map((c) => c.node)).toEqual([
        'baseline',
        'plan',
        'implement',
        'repair_research',
      ]);
    });

    it('throws for an unknown feature', async () => {
      features.findById.mockResolvedValue(null);
      await expect(new ListFeatureCheckpointsUseCase(features, repo).execute('x')).rejects.toThrow(
        /not found/
      );
    });
  });

  describe('GetFeatureCheckpointDiffUseCase', () => {
    let useCase: GetFeatureCheckpointDiffUseCase;
    beforeEach(() => {
      useCase = new GetFeatureCheckpointDiffUseCase(features, repo, git);
    });

    it('defaults "from" to the step before "to" — what that one step changed', async () => {
      const result = await useCase.execute({ featureId: FEATURE_ID, to: 'implement' });

      expect(result.from.node).toBe('plan');
      expect(result.to.node).toBe('implement');
      expect(git.diff).toHaveBeenCalledWith(
        '/repos/app',
        result.from.commitSha,
        result.to.commitSha
      );
      expect(result.files).toBe(FILES);
      expect(result).toMatchObject({ filesChanged: 2, additions: 10, deletions: 1 });
    });

    it('compares any two steps', async () => {
      const result = await useCase.execute({ featureId: FEATURE_ID, from: '0', to: '3' });
      expect([result.from.sequence, result.to.sequence]).toEqual([0, 3]);
    });

    it('rejects a baseline "to" without a "from": nothing came before it', async () => {
      await expect(useCase.execute({ featureId: FEATURE_ID, to: 'baseline' })).rejects.toThrow(
        /first checkpoint/
      );
    });

    it('throws for an unknown step', async () => {
      await expect(useCase.execute({ featureId: FEATURE_ID, to: 'merge' })).rejects.toThrow(
        GitCheckpointNotFoundError
      );
    });
  });
});
