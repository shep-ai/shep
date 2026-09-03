/**
 * ListFeaturesUseCase Unit Tests
 *
 * Tests for listing features with optional filters.
 * Uses mock repository.
 *
 * TDD Phase: RED-GREEN
 */

import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ListFeaturesUseCase } from '@/application/use-cases/features/list-features.use-case.js';
import type { IFeatureRepository } from '@/application/ports/output/repositories/feature-repository.interface.js';
import { SdlcLifecycle } from '@/domain/generated/output.js';
import { createMockFeatureRepository } from '../../../../helpers/feature-repository.mock.js';

describe('ListFeaturesUseCase', () => {
  let useCase: ListFeaturesUseCase;
  let mockRepo: IFeatureRepository;

  beforeEach(() => {
    mockRepo = createMockFeatureRepository();
    useCase = new ListFeaturesUseCase(mockRepo);
  });

  it('should list all features without filters', async () => {
    mockRepo.list = vi.fn().mockResolvedValue([{ id: '1' }, { id: '2' }]);
    const result = await useCase.execute();
    expect(result).toHaveLength(2);
    expect(mockRepo.list).toHaveBeenCalledWith(undefined);
  });

  it('should pass repository path filter', async () => {
    await useCase.execute({ repositoryPath: '/repo' });
    expect(mockRepo.list).toHaveBeenCalledWith({
      repositoryPath: '/repo',
    });
  });

  it('should pass lifecycle filter', async () => {
    await useCase.execute({ lifecycle: SdlcLifecycle.Implementation });
    expect(mockRepo.list).toHaveBeenCalledWith({
      lifecycle: SdlcLifecycle.Implementation,
    });
  });

  it('should return empty array when no features found', async () => {
    const result = await useCase.execute();
    expect(result).toEqual([]);
  });

  it('should pass combined filters', async () => {
    await useCase.execute({
      repositoryPath: '/repo',
      lifecycle: SdlcLifecycle.Review,
    });
    expect(mockRepo.list).toHaveBeenCalledWith({
      repositoryPath: '/repo',
      lifecycle: SdlcLifecycle.Review,
    });
  });
});
