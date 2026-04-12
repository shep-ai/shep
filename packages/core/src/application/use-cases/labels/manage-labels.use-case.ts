import { injectable, inject } from 'tsyringe';
import { randomUUID } from 'node:crypto';
import type { Label } from '../../../domain/generated/output.js';
import type { ILabelRepository } from '../../ports/output/repositories/label-repository.interface.js';

export interface CreateLabelInput {
  projectId: string;
  name: string;
  color: string;
  parentId?: string;
}

export type ManageLabelResult =
  | { ok: true; label?: Label; labels?: Label[] }
  | { ok: false; error: string };

@injectable()
export class ManageLabelsUseCase {
  constructor(@inject('ILabelRepository') private readonly labelRepo: ILabelRepository) {}

  async list(projectId: string): Promise<Label[]> {
    return this.labelRepo.listByProject(projectId);
  }

  async create(input: CreateLabelInput): Promise<ManageLabelResult> {
    const now = new Date();
    const label: Label = {
      id: randomUUID(),
      projectId: input.projectId,
      name: input.name.trim(),
      color: input.color,
      parentId: input.parentId,
      createdAt: now,
      updatedAt: now,
    };
    await this.labelRepo.create(label);
    return { ok: true, label };
  }

  async update(
    labelId: string,
    fields: Partial<Pick<Label, 'name' | 'color' | 'parentId'>>
  ): Promise<ManageLabelResult> {
    const existing = await this.labelRepo.findById(labelId);
    if (!existing) {
      return { ok: false, error: `Label not found: "${labelId}"` };
    }
    await this.labelRepo.update(labelId, fields);
    return { ok: true };
  }

  async delete(labelId: string): Promise<ManageLabelResult> {
    const existing = await this.labelRepo.findById(labelId);
    if (!existing) {
      return { ok: false, error: `Label not found: "${labelId}"` };
    }
    await this.labelRepo.softDelete(labelId);
    return { ok: true };
  }
}
