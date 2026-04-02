/**
 * ArchiveFeatureUseCase Unit Tests
 *
 * Tests for archiving a feature — transitioning lifecycle to Archived
 * and storing previousLifecycle for unarchive restoration.
 *
 * TDD Phase: RED-GREEN
 */

import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ArchiveFeatureUseCase } from '@/application/use-cases/features/archive-feature.use-case.js';
import type { IFeatureRepository } from '@/application/ports/output/repositories/feature-repository.interface.js';
import { SdlcLifecycle, FeatureMode } from '@/domain/generated/output.js';
import type { Feature } from '@/domain/generated/output.js';

function createMockFeature(overrides?: Partial<Feature>): Feature {
  return {
    id: 'feat-123-full-uuid',
    name: 'Test Feature',
    slug: 'test-feature',
    description: 'A test feature',
    userQuery: 'test user query',
    repositoryPath: '/repo',
    branch: 'feat/test-feature',
    lifecycle: SdlcLifecycle.Maintain,
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

describe('ArchiveFeatureUseCase', () => {
  let useCase: ArchiveFeatureUseCase;
  let mockFeatureRepo: IFeatureRepository;

  beforeEach(() => {
    mockFeatureRepo = {
      create: vi.fn(),
      findById: vi.fn().mockResolvedValue(createMockFeature()),
      findByIdPrefix: vi.fn().mockResolvedValue(null),
      findBySlug: vi.fn(),
      findByBranch: vi.fn(),
      list: vi.fn(),
      findByParentId: vi.fn().mockResolvedValue([]),
      update: vi.fn(),
      delete: vi.fn(),
      softDelete: vi.fn(),
    };

    useCase = new ArchiveFeatureUseCase(mockFeatureRepo);
  });

  it('should throw when feature not found', async () => {
    mockFeatureRepo.findById = vi.fn().mockResolvedValue(null);
    mockFeatureRepo.findByIdPrefix = vi.fn().mockResolvedValue(null);

    await expect(useCase.execute('non-existent')).rejects.toThrow(/not found/i);
  });

  it('should include the feature id in the not found error', async () => {
    mockFeatureRepo.findById = vi.fn().mockResolvedValue(null);
    mockFeatureRepo.findByIdPrefix = vi.fn().mockResolvedValue(null);

    await expect(useCase.execute('abc-123')).rejects.toThrow('abc-123');
  });

  it('should succeed for Started lifecycle', async () => {
    const feature = createMockFeature({ lifecycle: SdlcLifecycle.Started });
    mockFeatureRepo.findById = vi.fn().mockResolvedValue(feature);

    const result = await useCase.execute('feat-123-full-uuid');

    expect(result.lifecycle).toBe(SdlcLifecycle.Archived);
    expect(result.previousLifecycle).toBe(SdlcLifecycle.Started);
  });

  it('should succeed for Implementation lifecycle', async () => {
    const feature = createMockFeature({ lifecycle: SdlcLifecycle.Implementation });
    mockFeatureRepo.findById = vi.fn().mockResolvedValue(feature);

    const result = await useCase.execute('feat-123-full-uuid');

    expect(result.lifecycle).toBe(SdlcLifecycle.Archived);
    expect(result.previousLifecycle).toBe(SdlcLifecycle.Implementation);
  });

  it('should succeed for Review lifecycle', async () => {
    const feature = createMockFeature({ lifecycle: SdlcLifecycle.Review });
    mockFeatureRepo.findById = vi.fn().mockResolvedValue(feature);

    const result = await useCase.execute('feat-123-full-uuid');

    expect(result.lifecycle).toBe(SdlcLifecycle.Archived);
    expect(result.previousLifecycle).toBe(SdlcLifecycle.Review);
  });

  it('should throw when lifecycle is Archived (already archived)', async () => {
    const feature = createMockFeature({ lifecycle: SdlcLifecycle.Archived });
    mockFeatureRepo.findById = vi.fn().mockResolvedValue(feature);

    await expect(useCase.execute('feat-123-full-uuid')).rejects.toThrow(/cannot archive/i);
  });

  it('should throw when lifecycle is Deleting', async () => {
    const feature = createMockFeature({ lifecycle: SdlcLifecycle.Deleting });
    mockFeatureRepo.findById = vi.fn().mockResolvedValue(feature);

    await expect(useCase.execute('feat-123-full-uuid')).rejects.toThrow(/cannot archive/i);
  });

  it('should succeed when feature has active children', async () => {
    const feature = createMockFeature({ lifecycle: SdlcLifecycle.Maintain });
    const activeChild = createMockFeature({
      id: 'child-001',
      name: 'Active Child',
      lifecycle: SdlcLifecycle.Implementation,
    });
    mockFeatureRepo.findById = vi.fn().mockResolvedValue(feature);
    mockFeatureRepo.findByParentId = vi.fn().mockResolvedValue([activeChild]);

    const result = await useCase.execute('feat-123-full-uuid');
    expect(result.lifecycle).toBe(SdlcLifecycle.Archived);
  });

  it('should preserve children relationships when archiving parent', async () => {
    const feature = createMockFeature({ lifecycle: SdlcLifecycle.Maintain });
    const child1 = createMockFeature({
      id: 'c1',
      name: 'Login Feature',
      lifecycle: SdlcLifecycle.Started,
    });
    const child2 = createMockFeature({
      id: 'c2',
      name: 'Auth Feature',
      lifecycle: SdlcLifecycle.Review,
    });
    mockFeatureRepo.findById = vi.fn().mockResolvedValue(feature);
    mockFeatureRepo.findByParentId = vi.fn().mockResolvedValue([child1, child2]);

    const result = await useCase.execute('feat-123-full-uuid');
    expect(result.lifecycle).toBe(SdlcLifecycle.Archived);
    // Children's parentId should NOT be modified — only one update call for the parent
    expect(mockFeatureRepo.update).toHaveBeenCalledTimes(1);
  });

  it('should succeed for Maintain lifecycle, storing previousLifecycle', async () => {
    const feature = createMockFeature({ lifecycle: SdlcLifecycle.Maintain });
    mockFeatureRepo.findById = vi.fn().mockResolvedValue(feature);

    const result = await useCase.execute('feat-123-full-uuid');

    expect(result.lifecycle).toBe(SdlcLifecycle.Archived);
    expect(result.previousLifecycle).toBe(SdlcLifecycle.Maintain);
    expect(mockFeatureRepo.update).toHaveBeenCalledWith(
      expect.objectContaining({
        lifecycle: SdlcLifecycle.Archived,
        previousLifecycle: SdlcLifecycle.Maintain,
      })
    );
  });

  it('should succeed for Pending lifecycle', async () => {
    const feature = createMockFeature({ lifecycle: SdlcLifecycle.Pending });
    mockFeatureRepo.findById = vi.fn().mockResolvedValue(feature);

    const result = await useCase.execute('feat-123-full-uuid');

    expect(result.lifecycle).toBe(SdlcLifecycle.Archived);
    expect(result.previousLifecycle).toBe(SdlcLifecycle.Pending);
  });

  it('should succeed for Blocked lifecycle', async () => {
    const feature = createMockFeature({ lifecycle: SdlcLifecycle.Blocked });
    mockFeatureRepo.findById = vi.fn().mockResolvedValue(feature);

    const result = await useCase.execute('feat-123-full-uuid');

    expect(result.lifecycle).toBe(SdlcLifecycle.Archived);
    expect(result.previousLifecycle).toBe(SdlcLifecycle.Blocked);
  });

  it('should allow archiving when all children are also archived', async () => {
    const feature = createMockFeature({ lifecycle: SdlcLifecycle.Maintain });
    const archivedChild = createMockFeature({
      id: 'child-001',
      name: 'Archived Child',
      lifecycle: SdlcLifecycle.Archived,
    });
    mockFeatureRepo.findById = vi.fn().mockResolvedValue(feature);
    mockFeatureRepo.findByParentId = vi.fn().mockResolvedValue([archivedChild]);

    const result = await useCase.execute('feat-123-full-uuid');

    expect(result.lifecycle).toBe(SdlcLifecycle.Archived);
  });

  it('should allow archiving when all children are soft-deleted', async () => {
    const feature = createMockFeature({ lifecycle: SdlcLifecycle.Maintain });
    const deletedChild = createMockFeature({
      id: 'child-001',
      name: 'Deleted Child',
      lifecycle: SdlcLifecycle.Deleting,
      deletedAt: new Date(),
    });
    mockFeatureRepo.findById = vi.fn().mockResolvedValue(feature);
    mockFeatureRepo.findByParentId = vi.fn().mockResolvedValue([deletedChild]);

    const result = await useCase.execute('feat-123-full-uuid');

    expect(result.lifecycle).toBe(SdlcLifecycle.Archived);
  });

  it('should find feature by prefix match', async () => {
    const feature = createMockFeature({ lifecycle: SdlcLifecycle.Maintain });
    mockFeatureRepo.findById = vi.fn().mockResolvedValue(null);
    mockFeatureRepo.findByIdPrefix = vi.fn().mockResolvedValue(feature);

    const result = await useCase.execute('feat-123');

    expect(result.lifecycle).toBe(SdlcLifecycle.Archived);
    expect(mockFeatureRepo.findByIdPrefix).toHaveBeenCalledWith('feat-123');
  });

  it('should update the updatedAt timestamp', async () => {
    const oldDate = new Date('2024-01-01');
    const feature = createMockFeature({ lifecycle: SdlcLifecycle.Maintain, updatedAt: oldDate });
    mockFeatureRepo.findById = vi.fn().mockResolvedValue(feature);

    const result = await useCase.execute('feat-123-full-uuid');

    expect(result.updatedAt.getTime()).toBeGreaterThan(oldDate.getTime());
  });

  it('should return the updated feature', async () => {
    const feature = createMockFeature({ name: 'My Feature', lifecycle: SdlcLifecycle.Maintain });
    mockFeatureRepo.findById = vi.fn().mockResolvedValue(feature);

    const result = await useCase.execute('feat-123-full-uuid');

    expect(result.name).toBe('My Feature');
    expect(result.id).toBe('feat-123-full-uuid');
    expect(result.lifecycle).toBe(SdlcLifecycle.Archived);
  });
});
