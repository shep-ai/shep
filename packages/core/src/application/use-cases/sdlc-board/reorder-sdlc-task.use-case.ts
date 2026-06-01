/**
 * Reorder SDLC Task Use Case
 *
 * Updates the sortOrder of a single task (fractional indexing for
 * gap-free drag-and-drop reordering on the kanban board).
 */

import { injectable, inject } from 'tsyringe';
import type { ISdlcTaskRepository } from '../../ports/output/repositories/sdlc-task-repository.interface.js';

export interface ReorderSdlcTaskInput {
  taskId: string;
  sortOrder: number;
}

@injectable()
export class ReorderSdlcTaskUseCase {
  constructor(
    @inject('ISdlcTaskRepository')
    private readonly taskRepo: ISdlcTaskRepository
  ) {}

  async execute(input: ReorderSdlcTaskInput): Promise<void> {
    await this.taskRepo.updateSortOrder(input.taskId, input.sortOrder);
  }
}
