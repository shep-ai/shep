import { injectable, inject } from 'tsyringe';
import type { Epic, EpicStatus } from '../../../domain/generated/output.js';
import type { IEpicRepository } from '../../ports/output/repositories/epic-repository.interface.js';

export type UpdateEpicResult = { ok: true; epic: Epic } | { ok: false; error: string };

@injectable()
export class UpdateEpicUseCase {
  constructor(@inject('IEpicRepository') private readonly epicRepo: IEpicRepository) {}

  async execute(input: {
    epicId: string;
    name?: string;
    description?: string;
    status?: EpicStatus;
    startDate?: Date;
    endDate?: Date;
  }): Promise<UpdateEpicResult> {
    const existing = await this.epicRepo.findById(input.epicId);
    if (!existing) return { ok: false, error: 'Epic not found' };

    if (input.name !== undefined && !input.name.trim()) {
      return { ok: false, error: 'Epic name cannot be empty' };
    }

    const { epicId: _, ...fields } = input;
    await this.epicRepo.update(input.epicId, fields);

    const updated = await this.epicRepo.findById(input.epicId);
    return { ok: true, epic: updated! };
  }
}
