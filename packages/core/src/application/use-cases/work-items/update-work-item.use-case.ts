import { injectable, inject } from 'tsyringe';
import { randomUUID } from 'node:crypto';
import type { WorkItem } from '../../../domain/generated/output.js';
import type { IWorkItemRepository } from '../../ports/output/repositories/work-item-repository.interface.js';
import type { IActivityLogRepository } from '../../ports/output/repositories/activity-log-repository.interface.js';

export interface UpdateWorkItemInput {
  title?: string;
  description?: string;
  stateId?: string;
  priority?: string;
  parentId?: string;
  sortOrder?: number;
  startDate?: Date;
  dueDate?: Date;
  estimateValue?: string;
  customPropertyValues?: string;
}

export type UpdateWorkItemResult = { ok: true } | { ok: false; error: string };

@injectable()
export class UpdateWorkItemUseCase {
  constructor(
    @inject('IWorkItemRepository') private readonly workItemRepo: IWorkItemRepository,
    @inject('IActivityLogRepository') private readonly activityRepo: IActivityLogRepository
  ) {}

  async execute(
    workItemId: string,
    input: UpdateWorkItemInput,
    actorId = 'system'
  ): Promise<UpdateWorkItemResult> {
    const existing = await this.workItemRepo.findById(workItemId);
    if (!existing) {
      return { ok: false, error: `Work item not found: "${workItemId}"` };
    }

    const fields: Partial<
      Pick<
        WorkItem,
        | 'title'
        | 'description'
        | 'stateId'
        | 'priority'
        | 'parentId'
        | 'sortOrder'
        | 'startDate'
        | 'dueDate'
        | 'estimateValue'
        | 'customPropertyValues'
      >
    > = {};
    const now = new Date();

    const trackChange = async (fieldName: string, oldVal: unknown, newVal: unknown) => {
      if (oldVal !== newVal) {
        await this.activityRepo.create({
          id: randomUUID(),
          workItemId,
          fieldName,
          oldValue: oldVal != null ? String(oldVal) : undefined,
          newValue: newVal != null ? String(newVal) : undefined,
          actorId,
          createdAt: now,
          updatedAt: now,
        });
      }
    };

    if (input.title !== undefined) {
      fields.title = input.title;
      await trackChange('title', existing.title, input.title);
    }
    if (input.description !== undefined) {
      fields.description = input.description;
    }
    if (input.stateId !== undefined) {
      fields.stateId = input.stateId;
      await trackChange('state', existing.stateId, input.stateId);
    }
    if (input.priority !== undefined) {
      fields.priority = input.priority as WorkItem['priority'];
      await trackChange('priority', existing.priority, input.priority);
    }
    if (input.parentId !== undefined) {
      if (input.parentId) {
        if (input.parentId === workItemId) {
          return { ok: false, error: 'A work item cannot be its own parent.' };
        }
        const depth = await this.getAncestorDepth(input.parentId);
        if (depth >= 3) {
          return { ok: false, error: 'Maximum nesting depth of 3 levels exceeded.' };
        }
      }
      fields.parentId = input.parentId;
    }
    if (input.sortOrder !== undefined) {
      fields.sortOrder = input.sortOrder;
    }
    if (input.startDate !== undefined) {
      fields.startDate = input.startDate;
    }
    if (input.dueDate !== undefined) {
      fields.dueDate = input.dueDate;
    }
    if (input.estimateValue !== undefined) {
      fields.estimateValue = input.estimateValue;
      await trackChange('estimate', existing.estimateValue, input.estimateValue);
    }
    if (input.customPropertyValues !== undefined) {
      fields.customPropertyValues = input.customPropertyValues;
    }

    await this.workItemRepo.update(workItemId, fields);
    return { ok: true };
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
