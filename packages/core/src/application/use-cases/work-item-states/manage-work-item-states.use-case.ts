import { injectable, inject } from 'tsyringe';
import { randomUUID } from 'node:crypto';
import type { WorkItemState } from '../../../domain/generated/output.js';
import type { IWorkItemStateRepository } from '../../ports/output/repositories/work-item-state-repository.interface.js';

export interface CreateWorkItemStateInput {
  projectId: string;
  name: string;
  color: string;
  stateGroup: string;
  displayOrder?: number;
  isDefault?: boolean;
}

export type ManageWorkItemStateResult =
  | { ok: true; state?: WorkItemState; states?: WorkItemState[] }
  | { ok: false; error: string };

@injectable()
export class ManageWorkItemStatesUseCase {
  constructor(
    @inject('IWorkItemStateRepository') private readonly stateRepo: IWorkItemStateRepository
  ) {}

  async list(projectId: string): Promise<WorkItemState[]> {
    return this.stateRepo.listByProject(projectId);
  }

  async create(input: CreateWorkItemStateInput): Promise<ManageWorkItemStateResult> {
    const now = new Date();
    const state: WorkItemState = {
      id: randomUUID(),
      projectId: input.projectId,
      name: input.name.trim(),
      color: input.color,
      stateGroup: input.stateGroup as WorkItemState['stateGroup'],
      displayOrder: input.displayOrder ?? 0,
      isDefault: input.isDefault ?? false,
      createdAt: now,
      updatedAt: now,
    };
    await this.stateRepo.create(state);
    return { ok: true, state };
  }

  async update(
    stateId: string,
    fields: Partial<
      Pick<WorkItemState, 'name' | 'color' | 'displayOrder' | 'stateGroup' | 'isDefault'>
    >
  ): Promise<ManageWorkItemStateResult> {
    const existing = await this.stateRepo.findById(stateId);
    if (!existing) {
      return { ok: false, error: `State not found: "${stateId}"` };
    }
    await this.stateRepo.update(stateId, fields);
    return { ok: true };
  }

  async delete(stateId: string): Promise<ManageWorkItemStateResult> {
    const existing = await this.stateRepo.findById(stateId);
    if (!existing) {
      return { ok: false, error: `State not found: "${stateId}"` };
    }
    await this.stateRepo.softDelete(stateId);
    return { ok: true };
  }

  async reorder(
    states: { id: string; displayOrder: number }[]
  ): Promise<ManageWorkItemStateResult> {
    await this.stateRepo.reorder(states);
    return { ok: true };
  }
}
