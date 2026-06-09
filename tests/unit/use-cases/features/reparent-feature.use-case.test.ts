import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SdlcLifecycle } from '@/domain/generated/output.js';
import type { IFeatureRepository } from '@/application/ports/output/repositories/feature-repository.interface.js';
import type { Feature } from '@/domain/generated/output.js';
import { ReparentFeatureUseCase } from '@/application/use-cases/features/reparent-feature.use-case.js';
import type { CheckAndUnblockFeaturesUseCase } from '@/application/use-cases/features/check-and-unblock-features.use-case.js';

function makeFeature(overrides: Partial<Feature> = {}): Feature {
  return {
    id: 'feat-child',
    name: 'Child Feature',
    userQuery: 'test',
    slug: 'child-feature',
    description: 'test desc',
    repositoryPath: '/repo/path',
    branch: 'feat/child',
    lifecycle: SdlcLifecycle.Started,
    messages: [],
    relatedArtifacts: [],
    fast: false,
    push: false,
    openPr: false,
    forkAndPr: false,
    commitSpecs: false,
    ciWatchEnabled: false,
    enableEvidence: false,
    commitEvidence: false,
    approvalGates: { requireApproval: false },
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as Feature;
}

describe('ReparentFeatureUseCase', () => {
  let mockFeatureRepo: IFeatureRepository;
  let mockCheckAndUnblock: CheckAndUnblockFeaturesUseCase;
  let useCase: ReparentFeatureUseCase;

  beforeEach(() => {
    mockFeatureRepo = {
      create: vi.fn().mockResolvedValue(undefined),
      findById: vi.fn().mockResolvedValue(null),
      findByIdPrefix: vi.fn().mockResolvedValue(null),
      findBySlug: vi.fn().mockResolvedValue(null),
      findByBranch: vi.fn().mockResolvedValue(null),
      list: vi.fn().mockResolvedValue([]),
      update: vi.fn().mockResolvedValue(undefined),
      findByParentId: vi.fn().mockResolvedValue([]),
      delete: vi.fn().mockResolvedValue(undefined),
      softDelete: vi.fn().mockResolvedValue(undefined),
    };

    mockCheckAndUnblock = {
      execute: vi.fn().mockResolvedValue(undefined),
    } as unknown as CheckAndUnblockFeaturesUseCase;

    useCase = new ReparentFeatureUseCase(mockFeatureRepo, mockCheckAndUnblock);
  });

  // --- Task 1: Core validation logic ---

  it('should update parentId on successful reparent', async () => {
    const child = makeFeature({ id: 'child-1', parentId: undefined });
    const parent = makeFeature({
      id: 'parent-1',
      lifecycle: SdlcLifecycle.Implementation,
    });
    vi.mocked(mockFeatureRepo.findById)
      .mockResolvedValueOnce(child) // load child
      .mockResolvedValueOnce(parent); // load parent

    await useCase.execute({ featureId: 'child-1', parentId: 'parent-1' });

    expect(mockFeatureRepo.update).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'child-1',
        parentId: 'parent-1',
      })
    );
  });

  it('should reject self-reparent', async () => {
    await expect(useCase.execute({ featureId: 'feat-1', parentId: 'feat-1' })).rejects.toThrow(
      /cannot.*parent.*itself/i
    );
  });

  it('should reject reparent to non-existent parent', async () => {
    const child = makeFeature({ id: 'child-1' });
    vi.mocked(mockFeatureRepo.findById)
      .mockResolvedValueOnce(child) // load child
      .mockResolvedValueOnce(null); // parent not found

    await expect(
      useCase.execute({ featureId: 'child-1', parentId: 'nonexistent' })
    ).rejects.toThrow(/parent feature not found/i);
  });

  it('should reject reparent of non-existent child', async () => {
    vi.mocked(mockFeatureRepo.findById).mockResolvedValueOnce(null);

    await expect(
      useCase.execute({ featureId: 'nonexistent', parentId: 'parent-1' })
    ).rejects.toThrow(/feature not found/i);
  });

  it('should reject cross-repo reparent', async () => {
    const child = makeFeature({ id: 'child-1', repositoryPath: '/repo/a' });
    const parent = makeFeature({ id: 'parent-1', repositoryPath: '/repo/b' });
    vi.mocked(mockFeatureRepo.findById).mockResolvedValueOnce(child).mockResolvedValueOnce(parent);

    await expect(useCase.execute({ featureId: 'child-1', parentId: 'parent-1' })).rejects.toThrow(
      /same repository/i
    );
  });

  it('should reject direct cycle (A parent of B, try to reparent A under B)', async () => {
    const childA = makeFeature({ id: 'A', parentId: undefined });
    const parentB = makeFeature({ id: 'B', parentId: 'A' });
    vi.mocked(mockFeatureRepo.findById)
      .mockResolvedValueOnce(childA) // execute: load child A
      .mockResolvedValueOnce(parentB) // execute: load parent B
      .mockResolvedValueOnce(parentB); // detectCycle: load B (cursor=B), B.parentId=A -> cycle!

    await expect(useCase.execute({ featureId: 'A', parentId: 'B' })).rejects.toThrow(/cycle/i);
  });

  it('should reject indirect cycle (A->B->C chain, reparent A under C)', async () => {
    const childA = makeFeature({ id: 'A' });
    const parentC = makeFeature({ id: 'C', parentId: 'B' });
    const featureB = makeFeature({ id: 'B', parentId: 'A' });
    vi.mocked(mockFeatureRepo.findById)
      .mockResolvedValueOnce(childA) // execute: load child A
      .mockResolvedValueOnce(parentC) // execute: load parent C
      .mockResolvedValueOnce(parentC) // detectCycle: load C (cursor=C), C.parentId=B
      .mockResolvedValueOnce(featureB); // detectCycle: load B (cursor=B), B.parentId=A -> cycle!

    await expect(useCase.execute({ featureId: 'A', parentId: 'C' })).rejects.toThrow(/cycle/i);
  });

  it('should reject reparent of Archived feature', async () => {
    const child = makeFeature({ id: 'child-1', lifecycle: SdlcLifecycle.Archived });
    vi.mocked(mockFeatureRepo.findById).mockResolvedValueOnce(child);

    await expect(useCase.execute({ featureId: 'child-1', parentId: 'parent-1' })).rejects.toThrow(
      /cannot.*reparent/i
    );
  });

  it('should reject reparent of Maintain (done) feature', async () => {
    const child = makeFeature({ id: 'child-1', lifecycle: SdlcLifecycle.Maintain });
    vi.mocked(mockFeatureRepo.findById).mockResolvedValueOnce(child);

    await expect(useCase.execute({ featureId: 'child-1', parentId: 'parent-1' })).rejects.toThrow(
      /cannot.*reparent/i
    );
  });

  it('should reject reparent of Deleting feature', async () => {
    const child = makeFeature({ id: 'child-1', lifecycle: SdlcLifecycle.Deleting });
    vi.mocked(mockFeatureRepo.findById).mockResolvedValueOnce(child);

    await expect(useCase.execute({ featureId: 'child-1', parentId: 'parent-1' })).rejects.toThrow(
      /cannot.*reparent/i
    );
  });

  it('should clear parentId on unparent (parentId=null)', async () => {
    const child = makeFeature({ id: 'child-1', parentId: 'old-parent' });
    vi.mocked(mockFeatureRepo.findById).mockResolvedValueOnce(child);

    await useCase.execute({ featureId: 'child-1', parentId: null });

    expect(mockFeatureRepo.update).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'child-1',
        parentId: undefined,
      })
    );
  });

  it('should allow reparenting features in active lifecycle states', async () => {
    for (const lifecycle of [
      SdlcLifecycle.Started,
      SdlcLifecycle.Blocked,
      SdlcLifecycle.Pending,
      SdlcLifecycle.Requirements,
      SdlcLifecycle.Implementation,
    ]) {
      const child = makeFeature({ id: 'child-1', lifecycle });
      const parent = makeFeature({
        id: 'parent-1',
        lifecycle: SdlcLifecycle.Implementation,
      });
      vi.mocked(mockFeatureRepo.findById)
        .mockResolvedValueOnce(child)
        .mockResolvedValueOnce(parent);
      vi.mocked(mockFeatureRepo.update).mockClear();

      await useCase.execute({ featureId: 'child-1', parentId: 'parent-1' });

      expect(mockFeatureRepo.update).toHaveBeenCalled();
    }
  });

  // --- Task 2: Lifecycle state adjustment ---

  it('should transition Started child to Blocked when reparented under Pending parent', async () => {
    const child = makeFeature({ id: 'child-1', lifecycle: SdlcLifecycle.Started });
    const parent = makeFeature({ id: 'parent-1', lifecycle: SdlcLifecycle.Pending });
    vi.mocked(mockFeatureRepo.findById).mockResolvedValueOnce(child).mockResolvedValueOnce(parent);

    await useCase.execute({ featureId: 'child-1', parentId: 'parent-1' });

    expect(mockFeatureRepo.update).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'child-1',
        parentId: 'parent-1',
        lifecycle: SdlcLifecycle.Blocked,
      })
    );
  });

  it('should keep child lifecycle when reparented under Implementation parent', async () => {
    const child = makeFeature({ id: 'child-1', lifecycle: SdlcLifecycle.Started });
    const parent = makeFeature({ id: 'parent-1', lifecycle: SdlcLifecycle.Implementation });
    vi.mocked(mockFeatureRepo.findById).mockResolvedValueOnce(child).mockResolvedValueOnce(parent);

    await useCase.execute({ featureId: 'child-1', parentId: 'parent-1' });

    expect(mockFeatureRepo.update).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'child-1',
        lifecycle: SdlcLifecycle.Started,
      })
    );
  });

  it('should transition Blocked child to Started when unparented', async () => {
    const child = makeFeature({
      id: 'child-1',
      lifecycle: SdlcLifecycle.Blocked,
      parentId: 'old-parent',
    });
    vi.mocked(mockFeatureRepo.findById).mockResolvedValueOnce(child);

    await useCase.execute({ featureId: 'child-1', parentId: null });

    expect(mockFeatureRepo.update).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'child-1',
        lifecycle: SdlcLifecycle.Started,
      })
    );
  });

  it('should keep Pending lifecycle when unparented', async () => {
    const child = makeFeature({
      id: 'child-1',
      lifecycle: SdlcLifecycle.Pending,
      parentId: 'old-parent',
    });
    vi.mocked(mockFeatureRepo.findById).mockResolvedValueOnce(child);

    await useCase.execute({ featureId: 'child-1', parentId: null });

    expect(mockFeatureRepo.update).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'child-1',
        lifecycle: SdlcLifecycle.Pending,
      })
    );
  });

  it('should call CheckAndUnblockFeaturesUseCase when reparented under post-implementation parent', async () => {
    const child = makeFeature({ id: 'child-1', lifecycle: SdlcLifecycle.Blocked });
    const parent = makeFeature({ id: 'parent-1', lifecycle: SdlcLifecycle.Implementation });
    vi.mocked(mockFeatureRepo.findById).mockResolvedValueOnce(child).mockResolvedValueOnce(parent);

    await useCase.execute({ featureId: 'child-1', parentId: 'parent-1' });

    expect(mockCheckAndUnblock.execute).toHaveBeenCalledWith('child-1');
  });

  it('should NOT call CheckAndUnblockFeaturesUseCase when reparented under pre-implementation parent', async () => {
    const child = makeFeature({ id: 'child-1', lifecycle: SdlcLifecycle.Started });
    const parent = makeFeature({ id: 'parent-1', lifecycle: SdlcLifecycle.Requirements });
    vi.mocked(mockFeatureRepo.findById).mockResolvedValueOnce(child).mockResolvedValueOnce(parent);

    await useCase.execute({ featureId: 'child-1', parentId: 'parent-1' });

    expect(mockCheckAndUnblock.execute).not.toHaveBeenCalled();
  });

  it('should transition active child to Blocked when reparented under Blocked parent', async () => {
    const child = makeFeature({ id: 'child-1', lifecycle: SdlcLifecycle.Requirements });
    const parent = makeFeature({ id: 'parent-1', lifecycle: SdlcLifecycle.Blocked });
    vi.mocked(mockFeatureRepo.findById).mockResolvedValueOnce(child).mockResolvedValueOnce(parent);

    await useCase.execute({ featureId: 'child-1', parentId: 'parent-1' });

    expect(mockFeatureRepo.update).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'child-1',
        lifecycle: SdlcLifecycle.Blocked,
      })
    );
  });
});
