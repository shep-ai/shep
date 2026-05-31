/**
 * Update SDLC Task Status Use Case
 *
 * Validates the supplied status is a member of the TaskState enum,
 * then delegates to the task repository.
 */

import { injectable, inject } from 'tsyringe';
import { TaskState } from '../../../domain/generated/output.js';
import type { ISdlcTaskRepository } from '../../ports/output/repositories/sdlc-task-repository.interface.js';
import { InvalidTaskStatusError } from '../../../domain/errors/invalid-task-status.error.js';

const VALID_TASK_STATES = new Set<string>(Object.values(TaskState));

export interface UpdateSdlcTaskStatusInput {
  taskId: string;
  status: TaskState;
}

@injectable()
export class UpdateSdlcTaskStatusUseCase {
  constructor(
    @inject('ISdlcTaskRepository')
    private readonly taskRepo: ISdlcTaskRepository
  ) {}

  async execute(input: UpdateSdlcTaskStatusInput): Promise<void> {
    if (!VALID_TASK_STATES.has(input.status)) {
      throw new InvalidTaskStatusError(input.status);
    }
    await this.taskRepo.updateStatus(input.taskId, input.status);
  }
}
