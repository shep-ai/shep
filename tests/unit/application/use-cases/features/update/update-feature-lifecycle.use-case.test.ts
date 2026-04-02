/**
 * UpdateFeatureLifecycleUseCase Unit Tests
 *
 * Verifies that the use case:
 * - Persists the new lifecycle value on the feature
 * - Calls CheckAndUnblockFeaturesUseCase.execute() with the featureId after persisting
 * - Is a no-op when the feature is not found
 * - Still calls checkAndUnblock even if the lifecycle is unchanged (idempotent writes allowed)
 *
 * TDD Phase: RED-GREEN-REFACTOR
 */

import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UpdateFeatureLifecycleUseCase } from '@/application/use-cases/features/update/update-feature-lifecycle.use-case.js';
import type { IFeatureRepository } from '@/application/ports/output/repositories/feature-repository.interface.js';
import type { CheckAndUnblockFeaturesUseCase } from '@/application/use-cases/features/check-and-unblock-features.use-case.js';
import { SdlcLifecycle, FeatureMode } from '@/domain/generated/output.js';
import type { Feature } from '@/domain/generated/output.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeFeature(overrides?: Partial<Feature>): Feature {
  return {
    id: 'feat-001',
    name: 'Test Feature',
    slug: 'test-feature',
    description: 'A test feature',
    userQuery: 'test query',
    repositoryPath: '/repo',
    branch: 'feat/test-feature',
    lifecycle: SdlcLifecycle.Planning,
    messages: [],
    relatedArtifacts: [],
    mode: FeatureMode.Regular,
    iterationCount: 0,
    push: false,
    openPr: false,
    forkAndPr: false,
    commitSpecs: true,
    ciWatchEnabled: true,
    enableEvidence: false,
    injectSkills: false,
    commitEvidence: false,
    approvalGates: { allowPrd: false, allowPlan: false, allowMerge: false },
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Test Suite
// ---------------------------------------------------------------------------

describe('UpdateFeatureLifecycleUseCase', () => {
  let useCase: UpdateFeatureLifecycleUseCase;
  let mockFeatureRepo: IFeatureRepository;
  let mockCheckAndUnblock: CheckAndUnblockFeaturesUseCase;

  beforeEach(() => {
    mockFeatureRepo = {
      create: vi.fn(),
      findById: vi.fn().mockResolvedValue(makeFeature()),
      findByIdPrefix: vi.fn(),
      findBySlug: vi.fn(),
      findByBranch: vi.fn(),
      list: vi.fn(),
      findByParentId: vi.fn(),
      update: vi.fn().mockResolvedValue(undefined),
      delete: vi.fn(),
      softDelete: vi.fn(),
    };

    mockCheckAndUnblock = {
      execute: vi.fn().mockResolvedValue(undefined),
    } as unknown as CheckAndUnblockFeaturesUseCase;

    useCase = new UpdateFeatureLifecycleUseCase(mockFeatureRepo, mockCheckAndUnblock);
  });

  it('should persist the new lifecycle on the feature', async () => {
    const feature = makeFeature({ id: 'feat-001', lifecycle: SdlcLifecycle.Planning });
    mockFeatureRepo.findById = vi.fn().mockResolvedValue(feature);

    await useCase.execute({ featureId: 'feat-001', lifecycle: SdlcLifecycle.Review });

    expect(mockFeatureRepo.update).toHaveBeenCalledOnce();
    const updated = (mockFeatureRepo.update as ReturnType<typeof vi.fn>).mock
      .calls[0][0] as Feature;
    expect(updated.id).toBe('feat-001');
    expect(updated.lifecycle).toBe(SdlcLifecycle.Review);
  });

  it('should call checkAndUnblock.execute() with the featureId after persisting', async () => {
    await useCase.execute({ featureId: 'feat-001', lifecycle: SdlcLifecycle.Implementation });

    // featureRepo.update must be called before checkAndUnblock.execute (ordering)
    const updateOrder = (mockFeatureRepo.update as ReturnType<typeof vi.fn>).mock
      .invocationCallOrder[0];
    const unblockOrder = (mockCheckAndUnblock.execute as ReturnType<typeof vi.fn>).mock
      .invocationCallOrder[0];
    expect(updateOrder).toBeLessThan(unblockOrder);

    expect(mockCheckAndUnblock.execute).toHaveBeenCalledOnce();
    expect(mockCheckAndUnblock.execute).toHaveBeenCalledWith('feat-001');
  });

  it('should be a no-op when the feature is not found', async () => {
    mockFeatureRepo.findById = vi.fn().mockResolvedValue(null);

    await useCase.execute({ featureId: 'not-found', lifecycle: SdlcLifecycle.Review });

    expect(mockFeatureRepo.update).not.toHaveBeenCalled();
    expect(mockCheckAndUnblock.execute).not.toHaveBeenCalled();
  });

  it('should still call checkAndUnblock even when lifecycle value is unchanged', async () => {
    const feature = makeFeature({ id: 'feat-001', lifecycle: SdlcLifecycle.Implementation });
    mockFeatureRepo.findById = vi.fn().mockResolvedValue(feature);

    await useCase.execute({ featureId: 'feat-001', lifecycle: SdlcLifecycle.Implementation });

    expect(mockFeatureRepo.update).toHaveBeenCalledOnce();
    expect(mockCheckAndUnblock.execute).toHaveBeenCalledOnce();
  });
});
