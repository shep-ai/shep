/**
 * UpdateSdlcSubTaskStatusUseCase Unit Tests
 *
 * Verifies that the repo is called with correct args and that an invalid
 * status throws a domain error.
 *
 * TDD Phase: RED-GREEN
 */

import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UpdateSdlcSubTaskStatusUseCase } from '@/application/use-cases/sdlc-board/update-sdlc-subtask-status.use-case.js';
import type { ISdlcSubTaskRepository } from '@/application/ports/output/repositories/sdlc-subtask-repository.interface.js';
import { TaskState } from '@/domain/generated/output.js';

function createMockSubTaskRepo(): ISdlcSubTaskRepository {
  return {
    create: vi.fn(),
    findById: vi.fn(),
    listByTask: vi.fn(),
    listByFeature: vi.fn(),
    upsertByKey: vi.fn(),
    updateStatus: vi.fn().mockResolvedValue(undefined),
    updateSortOrder: vi.fn(),
  };
}

describe('UpdateSdlcSubTaskStatusUseCase', () => {
  let useCase: UpdateSdlcSubTaskStatusUseCase;
  let subTaskRepo: ISdlcSubTaskRepository;

  beforeEach(() => {
    subTaskRepo = createMockSubTaskRepo();
    useCase = new UpdateSdlcSubTaskStatusUseCase(subTaskRepo);
  });

  it('calls updateStatus with the correct subTaskId and status', async () => {
    await useCase.execute({ subTaskId: 'sub-1', status: TaskState.Done });
    expect(subTaskRepo.updateStatus).toHaveBeenCalledWith('sub-1', TaskState.Done);
    expect(subTaskRepo.updateStatus).toHaveBeenCalledTimes(1);
  });

  it('accepts all valid TaskState values', async () => {
    for (const status of Object.values(TaskState)) {
      await useCase.execute({ subTaskId: 'sub-x', status });
    }
    expect(subTaskRepo.updateStatus).toHaveBeenCalledTimes(Object.values(TaskState).length);
  });

  it('throws a domain error when an invalid status string is supplied', async () => {
    await expect(
      useCase.execute({ subTaskId: 'sub-1', status: 'Invalid' as TaskState })
    ).rejects.toThrow('Invalid task status: "Invalid"');
    expect(subTaskRepo.updateStatus).not.toHaveBeenCalled();
  });

  it('throws for whitespace-only status', async () => {
    await expect(
      useCase.execute({ subTaskId: 'sub-1', status: '   ' as TaskState })
    ).rejects.toThrow();
    expect(subTaskRepo.updateStatus).not.toHaveBeenCalled();
  });
});
