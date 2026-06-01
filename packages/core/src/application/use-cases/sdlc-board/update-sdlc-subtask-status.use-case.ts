/**
 * Update SDLC SubTask Status Use Case
 *
 * Validates the supplied status is a member of the TaskState enum,
 * then delegates to the sub-task repository.
 */

import { injectable, inject } from 'tsyringe';
import { TaskState } from '../../../domain/generated/output.js';
import type { ISdlcSubTaskRepository } from '../../ports/output/repositories/sdlc-subtask-repository.interface.js';
import { InvalidTaskStatusError } from '../../../domain/errors/invalid-task-status.error.js';

const VALID_TASK_STATES = new Set<string>(Object.values(TaskState));

export interface UpdateSdlcSubTaskStatusInput {
  subTaskId: string;
  status: TaskState;
}

@injectable()
export class UpdateSdlcSubTaskStatusUseCase {
  constructor(
    @inject('ISdlcSubTaskRepository')
    private readonly subTaskRepo: ISdlcSubTaskRepository
  ) {}

  async execute(input: UpdateSdlcSubTaskStatusInput): Promise<void> {
    if (!VALID_TASK_STATES.has(input.status)) {
      throw new InvalidTaskStatusError(input.status);
    }
    await this.subTaskRepo.updateStatus(input.subTaskId, input.status);
  }
}
