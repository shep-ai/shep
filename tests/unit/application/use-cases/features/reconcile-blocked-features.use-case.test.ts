/**
 * ReconcileBlockedFeaturesUseCase Unit Tests
 *
 * Verifies the self-healing sweep that restores the dependency-gate invariant:
 * no feature stays Blocked once its parent has passed the Implementation gate.
 *
 * TDD Phase: RED-GREEN-REFACTOR
 */

import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ReconcileBlockedFeaturesUseCase } from '@/application/use-cases/features/reconcile-blocked-features.use-case.js';
import type { CheckAndUnblockFeaturesUseCase } from '@/application/use-cases/features/check-and-unblock-features.use-case.js';
import type { IFeatureRepository } from '@/application/ports/output/repositories/feature-repository.interface.js';
import { SdlcLifecycle, BuildMode } from '@/domain/generated/output.js';
import type { Feature } from '@/domain/generated/output.js';

function makeFeature(overrides?: Partial<Feature>): Feature {
  return {
    id: 'feat-001',
    name: 'Test Feature',
    slug: 'test-feature',
    description: 'A test feature',
    userQuery: 'test query',
    repositoryPath: '/repo',
    branch: 'feat/test-feature',
    lifecycle: SdlcLifecycle.Blocked,
    messages: [],
    relatedArtifacts: [],
    buildMode: BuildMode.Application,
    fast: false,
    push: false,
    openPr: false,
    forkAndPr: false,
    commitSpecs: true,
    ciWatchEnabled: true,
    enableEvidence: false,
    commitEvidence: false,
    approvalGates: { allowPrd: false, allowPlan: false, allowMerge: false },
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as Feature;
}

describe('ReconcileBlockedFeaturesUseCase', () => {
  let useCase: ReconcileBlockedFeaturesUseCase;
  let mockFeatureRepo: IFeatureRepository;
  let mockCheckAndUnblock: CheckAndUnblockFeaturesUseCase;

  beforeEach(() => {
    mockFeatureRepo = {
      create: vi.fn(),
      findById: vi.fn(),
      findByIdPrefix: vi.fn(),
      findBySlug: vi.fn(),
      findByBranch: vi.fn(),
      list: vi.fn().mockResolvedValue([]),
      findByParentId: vi.fn().mockResolvedValue([]),
      update: vi.fn(),
      delete: vi.fn(),
      softDelete: vi.fn(),
    };

    mockCheckAndUnblock = {
      execute: vi.fn().mockResolvedValue([]),
    } as unknown as CheckAndUnblockFeaturesUseCase;

    useCase = new ReconcileBlockedFeaturesUseCase(mockFeatureRepo, mockCheckAndUnblock);
  });

  it('should query only Blocked features', async () => {
    await useCase.execute();

    expect(mockFeatureRepo.list).toHaveBeenCalledWith({ lifecycle: SdlcLifecycle.Blocked });
  });

  it('should be a no-op when nothing is Blocked', async () => {
    const result = await useCase.execute();

    expect(mockCheckAndUnblock.execute).not.toHaveBeenCalled();
    expect(result).toEqual({ unblockedFeatureIds: [] });
  });

  it('should delegate each stranded parent to CheckAndUnblockFeaturesUseCase', async () => {
    vi.mocked(mockFeatureRepo.list).mockResolvedValue([
      makeFeature({ id: 'child-1', parentId: 'parent-1' }),
    ]);
    vi.mocked(mockCheckAndUnblock.execute).mockResolvedValue(['child-1']);

    const result = await useCase.execute();

    expect(mockCheckAndUnblock.execute).toHaveBeenCalledWith('parent-1');
    expect(result).toEqual({ unblockedFeatureIds: ['child-1'] });
  });

  it('should evaluate each distinct parent exactly once', async () => {
    vi.mocked(mockFeatureRepo.list).mockResolvedValue([
      makeFeature({ id: 'child-1', parentId: 'parent-1' }),
      makeFeature({ id: 'child-2', parentId: 'parent-1' }),
      makeFeature({ id: 'child-3', parentId: 'parent-2' }),
    ]);

    await useCase.execute();

    expect(mockCheckAndUnblock.execute).toHaveBeenCalledTimes(2);
    expect(mockCheckAndUnblock.execute).toHaveBeenCalledWith('parent-1');
    expect(mockCheckAndUnblock.execute).toHaveBeenCalledWith('parent-2');
  });

  it('should ignore Blocked features that have no parent', async () => {
    vi.mocked(mockFeatureRepo.list).mockResolvedValue([
      makeFeature({ id: 'orphan', parentId: undefined }),
    ]);

    await useCase.execute();

    expect(mockCheckAndUnblock.execute).not.toHaveBeenCalled();
  });

  it('should not duplicate ids reported by more than one parent', async () => {
    vi.mocked(mockFeatureRepo.list).mockResolvedValue([
      makeFeature({ id: 'child-1', parentId: 'parent-1' }),
      makeFeature({ id: 'child-2', parentId: 'parent-2' }),
    ]);
    vi.mocked(mockCheckAndUnblock.execute)
      .mockResolvedValueOnce(['child-1'])
      .mockResolvedValueOnce(['child-1', 'child-2']);

    const result = await useCase.execute();

    expect(result.unblockedFeatureIds).toEqual(['child-1', 'child-2']);
  });

  it('should isolate a failing parent so the remaining parents are still evaluated', async () => {
    vi.mocked(mockFeatureRepo.list).mockResolvedValue([
      makeFeature({ id: 'child-1', parentId: 'parent-1' }),
      makeFeature({ id: 'child-2', parentId: 'parent-2' }),
    ]);
    vi.mocked(mockCheckAndUnblock.execute)
      .mockRejectedValueOnce(new Error('rebase exploded'))
      .mockResolvedValueOnce(['child-2']);

    const result = await useCase.execute();

    expect(mockCheckAndUnblock.execute).toHaveBeenCalledTimes(2);
    expect(result.unblockedFeatureIds).toEqual(['child-2']);
  });
});
