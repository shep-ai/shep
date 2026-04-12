import { injectable, inject } from 'tsyringe';
import { randomUUID } from 'node:crypto';
import type { IWorkItemRepository } from '../../ports/output/repositories/work-item-repository.interface.js';
import type { IActivityLogRepository } from '../../ports/output/repositories/activity-log-repository.interface.js';

export interface BulkUpdateWorkItemsInput {
  workItemIds: string[];
  operation:
    | { type: 'changeState'; stateId: string }
    | { type: 'changePriority'; priority: string }
    | { type: 'addLabel'; labelId: string }
    | { type: 'removeLabel'; labelId: string }
    | { type: 'addAssignee'; assigneeId: string }
    | { type: 'removeAssignee'; assigneeId: string }
    | { type: 'delete' };
}

export interface BulkUpdateResult {
  ok: boolean;
  succeeded: string[];
  failed: { id: string; error: string }[];
}

@injectable()
export class BulkUpdateWorkItemsUseCase {
  constructor(
    @inject('IWorkItemRepository') private readonly workItemRepo: IWorkItemRepository,
    @inject('IActivityLogRepository') private readonly activityRepo: IActivityLogRepository
  ) {}

  async execute(input: BulkUpdateWorkItemsInput, actorId = 'system'): Promise<BulkUpdateResult> {
    const { workItemIds, operation } = input;
    const succeeded: string[] = [];
    const failed: { id: string; error: string }[] = [];
    const now = new Date();

    for (const id of workItemIds) {
      try {
        const workItem = await this.workItemRepo.findById(id);
        if (!workItem) {
          failed.push({ id, error: 'Work item not found' });
          continue;
        }

        switch (operation.type) {
          case 'changeState': {
            const oldState = workItem.stateId;
            await this.workItemRepo.update(id, { stateId: operation.stateId });
            await this.activityRepo.create({
              id: randomUUID(),
              workItemId: id,
              fieldName: 'state',
              oldValue: oldState,
              newValue: operation.stateId,
              actorId,
              createdAt: now,
              updatedAt: now,
            });
            break;
          }
          case 'changePriority': {
            const oldPriority = workItem.priority;
            await this.workItemRepo.update(id, {
              priority: operation.priority as typeof workItem.priority,
            });
            await this.activityRepo.create({
              id: randomUUID(),
              workItemId: id,
              fieldName: 'priority',
              oldValue: oldPriority,
              newValue: operation.priority,
              actorId,
              createdAt: now,
              updatedAt: now,
            });
            break;
          }
          case 'addLabel':
            await this.workItemRepo.addLabel(id, operation.labelId);
            break;
          case 'removeLabel':
            await this.workItemRepo.removeLabel(id, operation.labelId);
            break;
          case 'addAssignee':
            await this.workItemRepo.addAssignee(id, operation.assigneeId);
            break;
          case 'removeAssignee':
            await this.workItemRepo.removeAssignee(id, operation.assigneeId);
            break;
          case 'delete':
            await this.workItemRepo.softDelete(id);
            await this.activityRepo.create({
              id: randomUUID(),
              workItemId: id,
              fieldName: 'deleted',
              oldValue: workItem.title,
              actorId,
              createdAt: now,
              updatedAt: now,
            });
            break;
        }

        succeeded.push(id);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        failed.push({ id, error: message });
      }
    }

    return { ok: failed.length === 0, succeeded, failed };
  }
}
