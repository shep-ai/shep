/**
 * ReorderSdlcTaskUseCase Unit Tests
 *
 * Verifies that the repo is called with the correct taskId and sortOrder.
 *
 * TDD Phase: RED-GREEN
 */

import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ReorderSdlcTaskUseCase } from '@/application/use-cases/sdlc-board/reorder-sdlc-task.use-case.js';
import type { ISdlcTaskRepository } from '@/application/ports/output/repositories/sdlc-task-repository.interface.js';

function createMockTaskRepo(): ISdlcTaskRepository {
  return {
    create: vi.fn(),
    findById: vi.fn(),
    listByFeature: vi.fn(),
    listAllActive: vi.fn(),
    upsertByKey: vi.fn(),
    updateStatus: vi.fn(),
    updateSortOrder: vi.fn().mockResolvedValue(undefined),
    deleteByFeature: vi.fn(),
  };
}

describe('ReorderSdlcTaskUseCase', () => {
  let useCase: ReorderSdlcTaskUseCase;
  let taskRepo: ISdlcTaskRepository;

  beforeEach(() => {
    taskRepo = createMockTaskRepo();
    useCase = new ReorderSdlcTaskUseCase(taskRepo);
  });

  it('calls updateSortOrder with the correct taskId and sortOrder', async () => {
    await useCase.execute({ taskId: 'task-1', sortOrder: 2.5 });
    expect(taskRepo.updateSortOrder).toHaveBeenCalledWith('task-1', 2.5);
    expect(taskRepo.updateSortOrder).toHaveBeenCalledTimes(1);
  });

  it('handles fractional sort order values', async () => {
    await useCase.execute({ taskId: 'task-abc', sortOrder: 0.00001 });
    expect(taskRepo.updateSortOrder).toHaveBeenCalledWith('task-abc', 0.00001);
  });

  it('handles zero sort order', async () => {
    await useCase.execute({ taskId: 'task-zero', sortOrder: 0 });
    expect(taskRepo.updateSortOrder).toHaveBeenCalledWith('task-zero', 0);
  });
});
