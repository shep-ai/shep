/**
 * CollectGateMetricsUseCase Unit Tests
 *
 * The shared "what did this feature actually change, and did CI pass?" probe
 * that both the supervisor gate evaluator and `--low-risk` judge against.
 *
 * TDD Phase: RED-GREEN
 */

import 'reflect-metadata';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CollectGateMetricsUseCase } from '@/application/use-cases/fleet/collect-gate-metrics.use-case.js';
import { CiStatus } from '@/domain/generated/output.js';

describe('CollectGateMetricsUseCase', () => {
  let featureRepo: { findById: ReturnType<typeof vi.fn> };
  let gitPr: {
    getDefaultBranch: ReturnType<typeof vi.fn>;
    getPrDiffSummary: ReturnType<typeof vi.fn>;
    getFileDiffs: ReturnType<typeof vi.fn>;
  };
  let useCase: CollectGateMetricsUseCase;

  beforeEach(() => {
    featureRepo = {
      findById: vi.fn().mockResolvedValue({
        id: 'f1',
        worktreePath: '/wt/feat-1',
        repositoryPath: '/repo',
        pr: { ciStatus: CiStatus.Success },
      }),
    };
    gitPr = {
      getDefaultBranch: vi.fn().mockResolvedValue('main'),
      getPrDiffSummary: vi
        .fn()
        .mockResolvedValue({ additions: 30, deletions: 12, filesChanged: 2 }),
      getFileDiffs: vi.fn().mockResolvedValue([{ path: 'src/a.ts' }, { path: 'src/b.ts' }]),
    };
    useCase = new CollectGateMetricsUseCase(featureRepo as never, gitPr as never);
  });

  it('reports the diff and CI facts guardrails are judged on', async () => {
    const metrics = await useCase.execute({ featureId: 'f1', repositoryPath: '/repo' });

    expect(metrics).toEqual({
      diffLines: 42,
      filesChanged: 2,
      modifiedFiles: ['src/a.ts', 'src/b.ts'],
      ciPassed: true,
    });
    expect(gitPr.getDefaultBranch).toHaveBeenCalledWith('/wt/feat-1');
  });

  it('diffs the feature worktree, not the repository checkout', async () => {
    await useCase.execute({ featureId: 'f1', repositoryPath: '/repo' });

    expect(gitPr.getPrDiffSummary).toHaveBeenCalledWith('/wt/feat-1', 'main');
    expect(gitPr.getFileDiffs).toHaveBeenCalledWith('/wt/feat-1', 'main');
  });

  it('falls back to the repository path when the feature has no worktree', async () => {
    featureRepo.findById.mockResolvedValue({
      id: 'f1',
      repositoryPath: '/repo',
      pr: { ciStatus: CiStatus.Success },
    });

    await useCase.execute({ featureId: 'f1', repositoryPath: '/repo' });

    expect(gitPr.getDefaultBranch).toHaveBeenCalledWith('/repo');
  });

  it('treats a feature with no PR as CI not passed', async () => {
    // prd and plan gates happen before a PR exists, so there is nothing that
    // could have gone green. Reporting `ciPassed` as true here would let a
    // requireCiPass rule approve blind.
    featureRepo.findById.mockResolvedValue({ id: 'f1', worktreePath: '/wt/feat-1' });

    const metrics = await useCase.execute({ featureId: 'f1', repositoryPath: '/repo' });

    expect(metrics?.ciPassed).toBe(false);
  });

  it('treats a failing or pending PR as CI not passed', async () => {
    featureRepo.findById.mockResolvedValue({
      id: 'f1',
      worktreePath: '/wt/feat-1',
      pr: { ciStatus: CiStatus.Failure },
    });

    const metrics = await useCase.execute({ featureId: 'f1', repositoryPath: '/repo' });

    expect(metrics?.ciPassed).toBe(false);
  });

  it('returns undefined when the feature is unknown', async () => {
    featureRepo.findById.mockResolvedValue(null);

    await expect(useCase.execute({ featureId: 'nope' })).resolves.toBeUndefined();
  });

  it('returns undefined when git cannot produce the diff', async () => {
    gitPr.getPrDiffSummary.mockRejectedValue(new Error('git unavailable'));

    await expect(
      useCase.execute({ featureId: 'f1', repositoryPath: '/repo' })
    ).resolves.toBeUndefined();
  });
});
