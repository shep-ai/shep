/**
 * UpdateSdlcTaskStatusUseCase Unit Tests
 *
 * Verifies that the repo is called with correct args and that an invalid
 * status throws a domain error.
 *
 * TDD Phase: RED-GREEN
 */

import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UpdateSdlcTaskStatusUseCase } from '@/application/use-cases/sdlc-board/update-sdlc-task-status.use-case.js';
import type { ISdlcTaskRepository } from '@/application/ports/output/repositories/sdlc-task-repository.interface.js';
import { TaskState } from '@/domain/generated/output.js';

function createMockTaskRepo(): ISdlcTaskRepository {
  return {
    create: vi.fn(),
    findById: vi.fn(),
    listByFeature: vi.fn(),
    listAllActive: vi.fn(),
    upsertByKey: vi.fn(),
    updateStatus: vi.fn().mockResolvedValue(undefined),
    updateSortOrder: vi.fn(),
    deleteByFeature: vi.fn(),
  };
}

describe('UpdateSdlcTaskStatusUseCase', () => {
  let useCase: UpdateSdlcTaskStatusUseCase;
  let taskRepo: ISdlcTaskRepository;

  beforeEach(() => {
    taskRepo = createMockTaskRepo();
    useCase = new UpdateSdlcTaskStatusUseCase(taskRepo);
  });

  it('calls updateStatus with the correct taskId and status', async () => {
    await useCase.execute({ taskId: 'task-1', status: TaskState.WIP });
    expect(taskRepo.updateStatus).toHaveBeenCalledWith('task-1', TaskState.WIP);
    expect(taskRepo.updateStatus).toHaveBeenCalledTimes(1);
  });

  it('accepts all valid TaskState values', async () => {
    for (const status of Object.values(TaskState)) {
      await useCase.execute({ taskId: 'task-x', status });
    }
    expect(taskRepo.updateStatus).toHaveBeenCalledTimes(Object.values(TaskState).length);
  });

  it('throws a domain error when an invalid status string is supplied', async () => {
    await expect(
      useCase.execute({ taskId: 'task-1', status: 'NotAStatus' as TaskState })
    ).rejects.toThrow('Invalid task status: "NotAStatus"');
    expect(taskRepo.updateStatus).not.toHaveBeenCalled();
  });

  it('throws for empty string status', async () => {
    await expect(useCase.execute({ taskId: 'task-1', status: '' as TaskState })).rejects.toThrow();
    expect(taskRepo.updateStatus).not.toHaveBeenCalled();
  });
});
