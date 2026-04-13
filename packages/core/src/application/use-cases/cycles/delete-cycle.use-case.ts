import { injectable, inject } from 'tsyringe';
import type { ICycleRepository } from '../../ports/output/repositories/cycle-repository.interface.js';

export type DeleteCycleResult = { ok: true } | { ok: false; error: string };

@injectable()
export class DeleteCycleUseCase {
  constructor(@inject('ICycleRepository') private readonly cycleRepo: ICycleRepository) {}

  async execute(cycleId: string): Promise<DeleteCycleResult> {
    const cycle = await this.cycleRepo.findById(cycleId);
    if (!cycle) {
      return { ok: false, error: `Cycle not found: "${cycleId}"` };
    }
    await this.cycleRepo.softDelete(cycleId);
    return { ok: true };
  }
}
