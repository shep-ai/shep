import { injectable, inject } from 'tsyringe';
import { randomUUID } from 'node:crypto';
import type { WorkItem } from '../../../domain/generated/output.js';
import { IntakeStatus } from '../../../domain/generated/output.js';
import type { IIntakeItemRepository } from '../../ports/output/repositories/intake-item-repository.interface.js';
import type { IPmProjectRepository } from '../../ports/output/repositories/pm-project-repository.interface.js';
import type { IWorkItemRepository } from '../../ports/output/repositories/work-item-repository.interface.js';
import type { IWorkItemStateRepository } from '../../ports/output/repositories/work-item-state-repository.interface.js';
import type { IActivityLogRepository } from '../../ports/output/repositories/activity-log-repository.interface.js';

export interface AcceptIntakeItemInput {
  intakeItemId: string;
  stateId?: string;
  priority?: string;
}

export type AcceptIntakeItemResult =
  | { ok: true; workItem: WorkItem }
  | { ok: false; error: string };

@injectable()
export class AcceptIntakeItemUseCase {
  constructor(
    @inject('IIntakeItemRepository') private readonly intakeRepo: IIntakeItemRepository,
    @inject('IPmProjectRepository') private readonly projectRepo: IPmProjectRepository,
    @inject('IWorkItemRepository') private readonly workItemRepo: IWorkItemRepository,
    @inject('IWorkItemStateRepository') private readonly stateRepo: IWorkItemStateRepository,
    @inject('IActivityLogRepository') private readonly activityRepo: IActivityLogRepository
  ) {}

  async execute(input: AcceptIntakeItemInput): Promise<AcceptIntakeItemResult> {
    const item = await this.intakeRepo.findById(input.intakeItemId);
    if (!item) {
      return { ok: false, error: `Intake item not found: "${input.intakeItemId}"` };
    }

    if (item.status !== IntakeStatus.Pending) {
      return {
        ok: false,
        error: `Intake item must be in Pending status to accept (current: ${item.status}).`,
      };
    }

    const project = await this.projectRepo.findById(item.projectId);
    if (!project) {
      return { ok: false, error: `Project not found: "${item.projectId}"` };
    }

    let stateId = input.stateId ?? item.suggestedStateId;
    if (!stateId) {
      const states = await this.stateRepo.listByProject(item.projectId);
      const defaultState = states.find((s) => s.isDefault) ?? states[0];
      if (!defaultState) {
        return { ok: false, error: 'Project has no workflow states configured.' };
      }
      stateId = defaultState.id;
    }

    const priority = input.priority ?? item.suggestedPriority ?? 'None';
    const sequenceId = await this.projectRepo.incrementWorkItemCounter(item.projectId);

    const now = new Date();
    const workItem: WorkItem = {
      id: randomUUID(),
      projectId: item.projectId,
      sequenceId,
      identifierPrefix: project.identifierPrefix,
      title: item.title,
      description: item.description,
      stateId,
      priority: priority as WorkItem['priority'],
      sortOrder: 0,
      createdAt: now,
      updatedAt: now,
    };

    await this.workItemRepo.create(workItem);

    await this.activityRepo.create({
      id: randomUUID(),
      workItemId: workItem.id,
      fieldName: 'created',
      newValue: item.title,
      actorId: 'system',
      createdAt: now,
      updatedAt: now,
    });

    await this.intakeRepo.update(input.intakeItemId, {
      status: IntakeStatus.Accepted,
      resultingWorkItemId: workItem.id,
    });

    return { ok: true, workItem };
  }
}
