import { injectable, inject } from 'tsyringe';
import { randomUUID } from 'node:crypto';
import type { WorkItem } from '../../../domain/generated/output.js';
import type { IPmProjectRepository } from '../../ports/output/repositories/pm-project-repository.interface.js';
import type { IWorkItemRepository } from '../../ports/output/repositories/work-item-repository.interface.js';
import type { IWorkItemStateRepository } from '../../ports/output/repositories/work-item-state-repository.interface.js';
import type { IActivityLogRepository } from '../../ports/output/repositories/activity-log-repository.interface.js';

export interface CreateWorkItemInput {
  projectId: string;
  title: string;
  description?: string;
  stateId?: string;
  priority?: string;
  parentId?: string;
  startDate?: Date;
  dueDate?: Date;
  estimateValue?: string;
}

export type CreateWorkItemResult = { ok: true; workItem: WorkItem } | { ok: false; error: string };

@injectable()
export class CreateWorkItemUseCase {
  constructor(
    @inject('IPmProjectRepository') private readonly projectRepo: IPmProjectRepository,
    @inject('IWorkItemRepository') private readonly workItemRepo: IWorkItemRepository,
    @inject('IWorkItemStateRepository') private readonly stateRepo: IWorkItemStateRepository,
    @inject('IActivityLogRepository') private readonly activityRepo: IActivityLogRepository
  ) {}

  async execute(input: CreateWorkItemInput): Promise<CreateWorkItemResult> {
    const trimmedTitle = input.title.trim();
    if (!trimmedTitle) {
      return { ok: false, error: 'Work item title is required.' };
    }

    const project = await this.projectRepo.findById(input.projectId);
    if (!project) {
      return { ok: false, error: `Project not found: "${input.projectId}"` };
    }

    let stateId = input.stateId;
    if (!stateId) {
      const states = await this.stateRepo.listByProject(input.projectId);
      const defaultState = states.find((s) => s.isDefault) ?? states[0];
      if (!defaultState) {
        return { ok: false, error: 'Project has no workflow states configured.' };
      }
      stateId = defaultState.id;
    }

    if (input.parentId) {
      const parent = await this.workItemRepo.findById(input.parentId);
      if (!parent) {
        return { ok: false, error: `Parent work item not found: "${input.parentId}"` };
      }
      const depth = await this.getAncestorDepth(input.parentId);
      if (depth >= 3) {
        return { ok: false, error: 'Maximum nesting depth of 3 levels exceeded.' };
      }
    }

    const sequenceId = await this.projectRepo.incrementWorkItemCounter(input.projectId);

    const now = new Date();
    const workItem: WorkItem = {
      id: randomUUID(),
      projectId: input.projectId,
      sequenceId,
      identifierPrefix: project.identifierPrefix,
      title: trimmedTitle,
      description: input.description,
      stateId,
      priority: (input.priority as WorkItem['priority']) ?? 'None',
      parentId: input.parentId,
      sortOrder: 0,
      startDate: input.startDate,
      dueDate: input.dueDate,
      estimateValue: input.estimateValue,
      createdAt: now,
      updatedAt: now,
    };

    await this.workItemRepo.create(workItem);

    await this.activityRepo.create({
      id: randomUUID(),
      workItemId: workItem.id,
      fieldName: 'created',
      newValue: trimmedTitle,
      actorId: 'system',
      createdAt: now,
      updatedAt: now,
    });

    return { ok: true, workItem };
  }

  private async getAncestorDepth(parentId: string): Promise<number> {
    let depth = 0;
    let currentId: string | undefined = parentId;
    while (currentId) {
      depth++;
      if (depth > 3) return depth;
      const parent = await this.workItemRepo.findById(currentId);
      currentId = parent?.parentId;
    }
    return depth;
  }
}
