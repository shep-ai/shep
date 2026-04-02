/**
 * ShowFeatureUseCase Unit Tests
 *
 * Tests for retrieving a single feature by ID.
 * Uses mock repository.
 *
 * TDD Phase: RED-GREEN
 */

import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ShowFeatureUseCase } from '@/application/use-cases/features/show-feature.use-case.js';
import type { IFeatureRepository } from '@/application/ports/output/repositories/feature-repository.interface.js';
import { SdlcLifecycle, FeatureMode } from '@/domain/generated/output.js';
import type { Feature } from '@/domain/generated/output.js';

function createMockFeature(id: string): Feature {
  return {
    id,
    name: 'Test',
    slug: 'test',
    description: 'Test feature',
    userQuery: 'test user query',
    repositoryPath: '/repo',
    branch: 'feat/test',
    lifecycle: SdlcLifecycle.Requirements,
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
  };
}

describe('ShowFeatureUseCase', () => {
  let useCase: ShowFeatureUseCase;
  let mockRepo: IFeatureRepository;

  beforeEach(() => {
    mockRepo = {
      create: vi.fn(),
      findById: vi.fn().mockResolvedValue(createMockFeature('feat-1')),
      findByIdPrefix: vi.fn().mockResolvedValue(null),
      findBySlug: vi.fn(),
      findByBranch: vi.fn(),
      list: vi.fn(),
      findByParentId: vi.fn().mockResolvedValue([]),
      update: vi.fn(),
      delete: vi.fn(),
      softDelete: vi.fn(),
    };
    useCase = new ShowFeatureUseCase(mockRepo);
  });

  it('should return feature by id', async () => {
    const result = await useCase.execute('feat-1');
    expect(result.id).toBe('feat-1');
    expect(mockRepo.findById).toHaveBeenCalledWith('feat-1');
  });

  it('should fall back to prefix match when exact match fails', async () => {
    mockRepo.findById = vi.fn().mockResolvedValue(null);
    mockRepo.findByIdPrefix = vi.fn().mockResolvedValue(createMockFeature('feat-1-full-uuid'));

    const result = await useCase.execute('feat-1');
    expect(result.id).toBe('feat-1-full-uuid');
    expect(mockRepo.findByIdPrefix).toHaveBeenCalledWith('feat-1');
  });

  it('should throw if feature not found by id or prefix', async () => {
    mockRepo.findById = vi.fn().mockResolvedValue(null);
    mockRepo.findByIdPrefix = vi.fn().mockResolvedValue(null);
    await expect(useCase.execute('non-existent')).rejects.toThrow(/not found/i);
  });

  it('should include feature id in error message', async () => {
    mockRepo.findById = vi.fn().mockResolvedValue(null);
    mockRepo.findByIdPrefix = vi.fn().mockResolvedValue(null);
    await expect(useCase.execute('abc-123')).rejects.toThrow('abc-123');
  });

  it('should not call prefix match if exact match succeeds', async () => {
    await useCase.execute('feat-1');
    expect(mockRepo.findByIdPrefix).not.toHaveBeenCalled();
  });

  it('should return the full feature object from repository', async () => {
    const mockFeature = createMockFeature('feat-2');
    mockFeature.name = 'My Feature';
    mockFeature.lifecycle = SdlcLifecycle.Implementation;
    mockRepo.findById = vi.fn().mockResolvedValue(mockFeature);

    const result = await useCase.execute('feat-2');
    expect(result.name).toBe('My Feature');
    expect(result.lifecycle).toBe(SdlcLifecycle.Implementation);
  });
});
