/**
 * AutoArchiveCompletedUseCase Unit Tests
 *
 * Tests for automatically archiving features that have been in Maintain
 * (completed) lifecycle longer than the configured delay.
 */

import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AutoArchiveCompletedUseCase } from '@/application/use-cases/features/auto-archive-completed.use-case.js';
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

describe('AutoArchiveCompletedUseCase', () => {
  let useCase: AutoArchiveCompletedUseCase;
  let mockFeatureRepo: IFeatureRepository;
  let archiveFeature: ArchiveFeatureUseCase;

  beforeEach(() => {
    mockFeatureRepo = {
      create: vi.fn(),
      findById: vi.fn(),
      findByIdPrefix: vi.fn().mockResolvedValue(null),
      findBySlug: vi.fn(),
      findByBranch: vi.fn(),
      list: vi.fn().mockResolvedValue([]),
      findByParentId: vi.fn().mockResolvedValue([]),
      update: vi.fn(),
      delete: vi.fn(),
      softDelete: vi.fn(),
    };

    archiveFeature = new ArchiveFeatureUseCase(mockFeatureRepo);
    useCase = new AutoArchiveCompletedUseCase(mockFeatureRepo, archiveFeature);
  });

  it('should return empty array when delay is 0 (disabled)', async () => {
    const result = await useCase.execute(0);
    expect(result).toEqual([]);
    expect(mockFeatureRepo.list).not.toHaveBeenCalled();
  });

  it('should return empty array when delay is negative', async () => {
    const result = await useCase.execute(-5);
    expect(result).toEqual([]);
    expect(mockFeatureRepo.list).not.toHaveBeenCalled();
  });

  it('should return empty array when no features are in Maintain state', async () => {
    mockFeatureRepo.list = vi.fn().mockResolvedValue([]);

    const result = await useCase.execute(10);
    expect(result).toEqual([]);
    expect(mockFeatureRepo.list).toHaveBeenCalledWith({
      lifecycle: SdlcLifecycle.Maintain,
    });
  });

  it('should not archive features updated less than delay minutes ago', async () => {
    const recentFeature = createMockFeature({
      updatedAt: new Date(), // Just now
    });
    mockFeatureRepo.list = vi.fn().mockResolvedValue([recentFeature]);

    const result = await useCase.execute(10);
    expect(result).toEqual([]);
    expect(mockFeatureRepo.update).not.toHaveBeenCalled();
  });

  it('should archive features updated more than delay minutes ago', async () => {
    const oldFeature = createMockFeature({
      updatedAt: new Date(Date.now() - 15 * 60_000), // 15 minutes ago
    });
    mockFeatureRepo.findById = vi.fn().mockResolvedValue(oldFeature);
    mockFeatureRepo.list = vi.fn().mockResolvedValue([oldFeature]);

    const result = await useCase.execute(10);
    expect(result).toHaveLength(1);
    expect(result[0].lifecycle).toBe(SdlcLifecycle.Archived);
    expect(result[0].previousLifecycle).toBe(SdlcLifecycle.Maintain);
  });

  it('should archive multiple eligible features', async () => {
    const old1 = createMockFeature({
      id: 'feat-001',
      updatedAt: new Date(Date.now() - 20 * 60_000),
    });
    const old2 = createMockFeature({
      id: 'feat-002',
      updatedAt: new Date(Date.now() - 30 * 60_000),
    });
    const recent = createMockFeature({
      id: 'feat-003',
      updatedAt: new Date(), // Just now
    });
    mockFeatureRepo.list = vi.fn().mockResolvedValue([old1, old2, recent]);
    mockFeatureRepo.findById = vi.fn().mockImplementation((id: string) => {
      if (id === 'feat-001') return Promise.resolve(old1);
      if (id === 'feat-002') return Promise.resolve(old2);
      return Promise.resolve(null);
    });

    const result = await useCase.execute(10);
    expect(result).toHaveLength(2);
  });

  it('should skip features that fail to archive gracefully', async () => {
    const old1 = createMockFeature({
      id: 'feat-001',
      updatedAt: new Date(Date.now() - 20 * 60_000),
    });
    const old2 = createMockFeature({
      id: 'feat-002',
      updatedAt: new Date(Date.now() - 20 * 60_000),
    });
    mockFeatureRepo.list = vi.fn().mockResolvedValue([old1, old2]);
    // First feature fails to find (already deleted), second succeeds
    mockFeatureRepo.findById = vi.fn().mockImplementation((id: string) => {
      if (id === 'feat-001') return Promise.resolve(null);
      if (id === 'feat-002') return Promise.resolve(old2);
      return Promise.resolve(null);
    });

    const result = await useCase.execute(10);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('feat-002');
  });

  it('should handle updatedAt as string (ISO 8601)', async () => {
    const oldFeature = createMockFeature({
      updatedAt: new Date(Date.now() - 15 * 60_000).toISOString() as unknown as Date,
    });
    mockFeatureRepo.findById = vi.fn().mockResolvedValue(oldFeature);
    mockFeatureRepo.list = vi.fn().mockResolvedValue([oldFeature]);

    const result = await useCase.execute(10);
    expect(result).toHaveLength(1);
  });

  it('should archive feature exactly at the delay threshold', async () => {
    const exactlyAtThreshold = createMockFeature({
      updatedAt: new Date(Date.now() - 10 * 60_000), // Exactly 10 minutes ago
    });
    mockFeatureRepo.findById = vi.fn().mockResolvedValue(exactlyAtThreshold);
    mockFeatureRepo.list = vi.fn().mockResolvedValue([exactlyAtThreshold]);

    const result = await useCase.execute(10);
    expect(result).toHaveLength(1);
  });
});
