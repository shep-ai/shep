/**
 * SdlcBoardTracker — Infrastructure adapter for the ISdlcBoardTracker port.
 *
 * Bridges the feature-agent to the SDLC Board by translating high-level,
 * key-addressed calls (`seedTasks`, `setTaskStatus`, `setSubTaskStatus`) into
 * concrete repository operations (`upsertByKey`, `updateStatus`).
 *
 * Design notes:
 * - IDs are generated with `randomUUID()` from `node:crypto`, consistent with
 *   every other infrastructure adapter in this codebase.
 * - `seedTasks` is idempotent: the repository's `upsertByKey` guarantees no
 *   duplicate rows when called with the same (featureId, taskKey) or
 *   (taskId, subTaskKey) combination.
 * - `setTaskStatus` / `setSubTaskStatus` resolve entities by their stable
 *   string keys; if a key is not found the call resolves without error.
 */

import { randomUUID } from 'node:crypto';
import { inject, injectable } from 'tsyringe';

import type {
  ISdlcBoardTracker,
  SeedTask,
} from '../../../application/ports/output/agents/sdlc-board-tracker.interface.js';
import type { ISdlcTaskRepository } from '../../../application/ports/output/repositories/sdlc-task-repository.interface.js';
import type { ISdlcSubTaskRepository } from '../../../application/ports/output/repositories/sdlc-subtask-repository.interface.js';
import { TaskState } from '../../../domain/generated/output.js';

@injectable()
export class SdlcBoardTracker implements ISdlcBoardTracker {
  constructor(
    @inject('ISdlcTaskRepository')
    private readonly taskRepo: ISdlcTaskRepository,
    @inject('ISdlcSubTaskRepository')
    private readonly subTaskRepo: ISdlcSubTaskRepository
  ) {}

  /**
   * Idempotent upsert of the entire task plan for a feature.
   *
   * Generates a fresh UUID for each task and sub-task on every call — the
   * repository's upsert-by-key logic ignores the id when a row already
   * exists, so duplicate UUIDs are never written.
   */
  async seedTasks(featureId: string, tasks: SeedTask[]): Promise<void> {
    for (const task of tasks) {
      const taskId = randomUUID();

      await this.taskRepo.upsertByKey(taskId, featureId, task.taskKey, {
        title: task.title,
        description: task.description,
        status: task.status ?? TaskState.Todo,
        sortOrder: task.sortOrder,
        branch: task.branch,
        dependsOnKeys: task.dependsOnKeys,
        agentRunId: task.agentRunId,
      });

      for (const subTask of task.subTasks) {
        const subTaskId = randomUUID();

        await this.subTaskRepo.upsertByKey(subTaskId, taskId, subTask.subTaskKey, {
          featureId,
          name: subTask.name,
          description: subTask.description,
          status: subTask.status ?? TaskState.Todo,
          sortOrder: subTask.sortOrder,
        });
      }
    }
  }

  /**
   * Transition a task's workflow state.
   *
   * Resolves the task by its stable `taskKey` within the given `featureId`.
   * No-ops gracefully when the key is not found.
   */
  async setTaskStatus(featureId: string, taskKey: string, status: TaskState): Promise<void> {
    const tasks = await this.taskRepo.listByFeature(featureId);
    const task = tasks.find((t) => t.taskKey === taskKey);

    if (!task) {
      return;
    }

    await this.taskRepo.updateStatus(task.id, status);
  }

  /**
   * Transition a sub-task's workflow state.
   *
   * First resolves the parent task by `taskKey` within `featureId`, then
   * resolves the sub-task by `subTaskKey` within that task. No-ops
   * gracefully when either key is not found.
   */
  async setSubTaskStatus(
    featureId: string,
    taskKey: string,
    subTaskKey: string,
    status: TaskState
  ): Promise<void> {
    const tasks = await this.taskRepo.listByFeature(featureId);
    const task = tasks.find((t) => t.taskKey === taskKey);

    if (!task) {
      return;
    }

    const subTasks = await this.subTaskRepo.listByTask(task.id);
    const subTask = subTasks.find((st) => st.subTaskKey === subTaskKey);

    if (!subTask) {
      return;
    }

    await this.subTaskRepo.updateStatus(subTask.id, status);
  }
}
