/**
 * List SDLC Board Use Case
 *
 * Builds a ready-to-render board data structure:
 *   - Epics = Features (non-deleted)
 *   - Each epic contains tasks sorted by sortOrder ASC
 *   - Each task node contains its sub-tasks sorted by sortOrder ASC
 *
 * Avoids N+1 by fetching all active tasks in one call, then fetching
 * sub-tasks per feature (one call per feature with tasks, or all features
 * with a denormalized featureId lookup).
 */

import { injectable, inject } from 'tsyringe';
import type { Feature, SdlcTask, SdlcSubTask } from '../../../domain/generated/output.js';
import type { IFeatureRepository } from '../../ports/output/repositories/feature-repository.interface.js';
import type { ISdlcTaskRepository } from '../../ports/output/repositories/sdlc-task-repository.interface.js';
import type { ISdlcSubTaskRepository } from '../../ports/output/repositories/sdlc-subtask-repository.interface.js';

/** A task with its nested sub-tasks, ready for rendering. */
export interface SdlcBoardTaskNode {
  task: SdlcTask;
  subTasks: SdlcSubTask[];
}

/** An epic (Feature) with its nested task nodes. */
export interface SdlcBoardEpic {
  feature: Feature;
  tasks: SdlcBoardTaskNode[];
}

/** Top-level board data returned by ListSdlcBoardUseCase. */
export interface SdlcBoardData {
  epics: SdlcBoardEpic[];
}

@injectable()
export class ListSdlcBoardUseCase {
  constructor(
    @inject('IFeatureRepository')
    private readonly featureRepo: IFeatureRepository,
    @inject('ISdlcTaskRepository')
    private readonly taskRepo: ISdlcTaskRepository,
    @inject('ISdlcSubTaskRepository')
    private readonly subTaskRepo: ISdlcSubTaskRepository
  ) {}

  async execute(): Promise<SdlcBoardData> {
    // Fetch all non-deleted features as epics
    const features = await this.featureRepo.list({ includeDeleted: false });

    if (features.length === 0) {
      return { epics: [] };
    }

    // Fetch all active tasks in a single query (avoids N+1)
    const allTasks = await this.taskRepo.listAllActive();

    // Group tasks by featureId
    const tasksByFeature = new Map<string, SdlcTask[]>();
    for (const task of allTasks) {
      const existing = tasksByFeature.get(task.featureId);
      if (existing) {
        existing.push(task);
      } else {
        tasksByFeature.set(task.featureId, [task]);
      }
    }

    // Build epics in parallel: fetch sub-tasks per feature
    const epics: SdlcBoardEpic[] = await Promise.all(
      features.map(async (feature) => {
        const featureTasks = (tasksByFeature.get(feature.id) ?? [])
          .slice()
          .sort((a, b) => a.sortOrder - b.sortOrder);

        if (featureTasks.length === 0) {
          return { feature, tasks: [] };
        }

        // Fetch sub-tasks for this feature in one call (denormalized featureId)
        const subTasks = await this.subTaskRepo.listByFeature(feature.id);

        // Group sub-tasks by taskId
        const subTasksByTask = new Map<string, SdlcSubTask[]>();
        for (const sub of subTasks) {
          const existing = subTasksByTask.get(sub.taskId);
          if (existing) {
            existing.push(sub);
          } else {
            subTasksByTask.set(sub.taskId, [sub]);
          }
        }

        const taskNodes: SdlcBoardTaskNode[] = featureTasks.map((task) => {
          const nested = (subTasksByTask.get(task.id) ?? [])
            .slice()
            .sort((a, b) => a.sortOrder - b.sortOrder);
          return { task, subTasks: nested };
        });

        return { feature, tasks: taskNodes };
      })
    );

    return { epics };
  }
}
