/**
 * UnarchiveFeatureUseCase Unit Tests
 *
 * Tests for unarchiving a feature — restoring lifecycle from Archived
 * to its previousLifecycle value.
 *
 * TDD Phase: RED-GREEN
 */

import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UnarchiveFeatureUseCase } from '@/application/use-cases/features/unarchive-feature.use-case.js';
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
    lifecycle: SdlcLifecycle.Archived,
    previousLifecycle: SdlcLifecycle.Maintain,
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

describe('UnarchiveFeatureUseCase', () => {
  let useCase: UnarchiveFeatureUseCase;
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

    useCase = new UnarchiveFeatureUseCase(mockFeatureRepo);
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

  it('should throw when lifecycle is not Archived', async () => {
    const feature = createMockFeature({ lifecycle: SdlcLifecycle.Maintain });
    mockFeatureRepo.findById = vi.fn().mockResolvedValue(feature);

    await expect(useCase.execute('feat-123-full-uuid')).rejects.toThrow(/cannot unarchive/i);
  });

  it('should throw when lifecycle is Pending (not Archived)', async () => {
    const feature = createMockFeature({ lifecycle: SdlcLifecycle.Pending });
    mockFeatureRepo.findById = vi.fn().mockResolvedValue(feature);

    await expect(useCase.execute('feat-123-full-uuid')).rejects.toThrow(/cannot unarchive/i);
  });

  it('should throw when previousLifecycle is null', async () => {
    const feature = createMockFeature({
      lifecycle: SdlcLifecycle.Archived,
      previousLifecycle: undefined,
    });
    mockFeatureRepo.findById = vi.fn().mockResolvedValue(feature);

    await expect(useCase.execute('feat-123-full-uuid')).rejects.toThrow(/no previous lifecycle/i);
  });

  it('should restore Maintain lifecycle and clear previousLifecycle', async () => {
    const feature = createMockFeature({
      lifecycle: SdlcLifecycle.Archived,
      previousLifecycle: SdlcLifecycle.Maintain,
    });
    mockFeatureRepo.findById = vi.fn().mockResolvedValue(feature);

    const result = await useCase.execute('feat-123-full-uuid');

    expect(result.lifecycle).toBe(SdlcLifecycle.Maintain);
    expect(result.previousLifecycle).toBeUndefined();
    expect(mockFeatureRepo.update).toHaveBeenCalledWith(
      expect.objectContaining({
        lifecycle: SdlcLifecycle.Maintain,
        previousLifecycle: undefined,
      })
    );
  });

  it('should restore Pending lifecycle', async () => {
    const feature = createMockFeature({
      lifecycle: SdlcLifecycle.Archived,
      previousLifecycle: SdlcLifecycle.Pending,
    });
    mockFeatureRepo.findById = vi.fn().mockResolvedValue(feature);

    const result = await useCase.execute('feat-123-full-uuid');

    expect(result.lifecycle).toBe(SdlcLifecycle.Pending);
    expect(result.previousLifecycle).toBeUndefined();
  });

  it('should restore Blocked lifecycle', async () => {
    const feature = createMockFeature({
      lifecycle: SdlcLifecycle.Archived,
      previousLifecycle: SdlcLifecycle.Blocked,
    });
    mockFeatureRepo.findById = vi.fn().mockResolvedValue(feature);

    const result = await useCase.execute('feat-123-full-uuid');

    expect(result.lifecycle).toBe(SdlcLifecycle.Blocked);
    expect(result.previousLifecycle).toBeUndefined();
  });

  it('should find feature by prefix match', async () => {
    const feature = createMockFeature();
    mockFeatureRepo.findById = vi.fn().mockResolvedValue(null);
    mockFeatureRepo.findByIdPrefix = vi.fn().mockResolvedValue(feature);

    const result = await useCase.execute('feat-123');

    expect(result.lifecycle).toBe(SdlcLifecycle.Maintain);
    expect(mockFeatureRepo.findByIdPrefix).toHaveBeenCalledWith('feat-123');
  });

  it('should update the updatedAt timestamp', async () => {
    const oldDate = new Date('2024-01-01');
    const feature = createMockFeature({ updatedAt: oldDate });
    mockFeatureRepo.findById = vi.fn().mockResolvedValue(feature);

    const result = await useCase.execute('feat-123-full-uuid');

    expect(result.updatedAt.getTime()).toBeGreaterThan(oldDate.getTime());
  });

  it('should return the updated feature', async () => {
    const feature = createMockFeature({ name: 'My Feature' });
    mockFeatureRepo.findById = vi.fn().mockResolvedValue(feature);

    const result = await useCase.execute('feat-123-full-uuid');

    expect(result.name).toBe('My Feature');
    expect(result.id).toBe('feat-123-full-uuid');
    expect(result.lifecycle).toBe(SdlcLifecycle.Maintain);
  });
});
