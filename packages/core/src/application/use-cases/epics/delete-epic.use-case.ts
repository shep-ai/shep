import { injectable, inject } from 'tsyringe';
import type { IEpicRepository } from '../../ports/output/repositories/epic-repository.interface.js';

export type DeleteEpicResult = { ok: true } | { ok: false; error: string };

@injectable()
export class DeleteEpicUseCase {
  constructor(@inject('IEpicRepository') private readonly epicRepo: IEpicRepository) {}

  async execute(epicId: string): Promise<DeleteEpicResult> {
    const existing = await this.epicRepo.findById(epicId);
    if (!existing) return { ok: false, error: 'Epic not found' };

    await this.epicRepo.softDelete(epicId);
    return { ok: true };
  }
}
