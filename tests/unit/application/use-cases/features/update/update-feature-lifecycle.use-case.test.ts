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
import type { ILogger } from '@/application/ports/output/services/logger.interface.js';
import { SdlcLifecycle, BuildMode } from '@/domain/generated/output.js';
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
    buildMode: BuildMode.Application,
    fast: false,
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
  let mockLogger: ILogger;

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

    mockLogger = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };

    useCase = new UpdateFeatureLifecycleUseCase(mockFeatureRepo, mockCheckAndUnblock, mockLogger);
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

  // --- Dependency gate: a Blocked feature must not be advanced ---

  /** Wire findById to answer for the child first, then for its parent. */
  function withParent(child: Feature, parent: Feature | null): void {
    mockFeatureRepo.findById = vi
      .fn()
      .mockResolvedValueOnce(child)
      .mockResolvedValueOnce(parent ?? null);
  }

  it('should refuse to advance a Blocked feature whose parent has not completed', async () => {
    const child = makeFeature({
      id: 'feat-child',
      lifecycle: SdlcLifecycle.Blocked,
      parentId: 'feat-parent',
    });
    withParent(child, makeFeature({ id: 'feat-parent', lifecycle: SdlcLifecycle.Implementation }));

    await useCase.execute({ featureId: 'feat-child', lifecycle: SdlcLifecycle.Research });

    expect(mockFeatureRepo.update).not.toHaveBeenCalled();
    expect(mockCheckAndUnblock.execute).not.toHaveBeenCalled();
  });

  it('should refuse to advance a Blocked feature whose parent is only in Review', async () => {
    const child = makeFeature({
      id: 'feat-child',
      lifecycle: SdlcLifecycle.Blocked,
      parentId: 'feat-parent',
    });
    withParent(child, makeFeature({ id: 'feat-parent', lifecycle: SdlcLifecycle.Review }));

    await useCase.execute({ featureId: 'feat-child', lifecycle: SdlcLifecycle.Implementation });

    expect(mockFeatureRepo.update).not.toHaveBeenCalled();
  });

  it('should allow advancing a Blocked feature once its parent reached Maintain', async () => {
    const child = makeFeature({
      id: 'feat-child',
      lifecycle: SdlcLifecycle.Blocked,
      parentId: 'feat-parent',
    });
    withParent(child, makeFeature({ id: 'feat-parent', lifecycle: SdlcLifecycle.Maintain }));

    await useCase.execute({ featureId: 'feat-child', lifecycle: SdlcLifecycle.Requirements });

    const updated = (mockFeatureRepo.update as ReturnType<typeof vi.fn>).mock
      .calls[0][0] as Feature;
    expect(updated.lifecycle).toBe(SdlcLifecycle.Requirements);
  });

  it('should allow Deleting a Blocked feature even while the gate is closed', async () => {
    const child = makeFeature({
      id: 'feat-child',
      lifecycle: SdlcLifecycle.Blocked,
      parentId: 'feat-parent',
    });
    withParent(child, makeFeature({ id: 'feat-parent', lifecycle: SdlcLifecycle.Planning }));

    await useCase.execute({ featureId: 'feat-child', lifecycle: SdlcLifecycle.Deleting });

    const updated = (mockFeatureRepo.update as ReturnType<typeof vi.fn>).mock
      .calls[0][0] as Feature;
    expect(updated.lifecycle).toBe(SdlcLifecycle.Deleting);
  });

  it('should not strand a Blocked feature whose parent no longer exists', async () => {
    const child = makeFeature({
      id: 'feat-child',
      lifecycle: SdlcLifecycle.Blocked,
      parentId: 'feat-deleted-parent',
    });
    withParent(child, null);

    await useCase.execute({ featureId: 'feat-child', lifecycle: SdlcLifecycle.Requirements });

    const updated = (mockFeatureRepo.update as ReturnType<typeof vi.fn>).mock
      .calls[0][0] as Feature;
    expect(updated.lifecycle).toBe(SdlcLifecycle.Requirements);
  });

  it('should log a warning naming the parent when it refuses the write', async () => {
    const child = makeFeature({
      id: 'feat-child',
      lifecycle: SdlcLifecycle.Blocked,
      parentId: 'feat-parent',
    });
    withParent(child, makeFeature({ id: 'feat-parent', lifecycle: SdlcLifecycle.Implementation }));

    await useCase.execute({ featureId: 'feat-child', lifecycle: SdlcLifecycle.Research });

    // A rejected write is otherwise indistinguishable from a successful one:
    // execute() resolves either way, so a user action that does nothing needs a
    // reason recorded somewhere.
    expect(mockLogger.warn).toHaveBeenCalledOnce();
    const [, meta] = (mockLogger.warn as ReturnType<typeof vi.fn>).mock.calls[0] as [
      string,
      Record<string, unknown>,
    ];
    expect(meta).toMatchObject({
      featureId: 'feat-child',
      target: SdlcLifecycle.Research,
      parentId: 'feat-parent',
      parentLifecycle: SdlcLifecycle.Implementation,
    });
  });

  it('should not warn when the write is allowed', async () => {
    await useCase.execute({ featureId: 'feat-001', lifecycle: SdlcLifecycle.Review });

    expect(mockLogger.warn).not.toHaveBeenCalled();
  });

  it('should not strand a Blocked feature that is its own parent', async () => {
    // A corrupted parentId === id row can never satisfy its own gate, so gating
    // on it would leave the feature Blocked with nothing able to release it.
    const selfParented = makeFeature({
      id: 'feat-loop',
      lifecycle: SdlcLifecycle.Blocked,
      parentId: 'feat-loop',
    });
    withParent(selfParented, selfParented);

    await useCase.execute({ featureId: 'feat-loop', lifecycle: SdlcLifecycle.Requirements });

    const updated = (mockFeatureRepo.update as ReturnType<typeof vi.fn>).mock
      .calls[0][0] as Feature;
    expect(updated.lifecycle).toBe(SdlcLifecycle.Requirements);
  });

  it('should not load a parent for a feature that is not Blocked', async () => {
    const feature = makeFeature({
      id: 'feat-001',
      lifecycle: SdlcLifecycle.Implementation,
      parentId: 'feat-parent',
    });
    mockFeatureRepo.findById = vi.fn().mockResolvedValue(feature);

    await useCase.execute({ featureId: 'feat-001', lifecycle: SdlcLifecycle.Review });

    expect(mockFeatureRepo.findById).toHaveBeenCalledTimes(1);
    expect(mockFeatureRepo.update).toHaveBeenCalledOnce();
  });
});
