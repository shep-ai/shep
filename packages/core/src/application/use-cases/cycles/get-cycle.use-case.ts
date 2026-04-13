import { injectable, inject } from 'tsyringe';
import type { Cycle } from '../../../domain/generated/output.js';
import type { ICycleRepository } from '../../ports/output/repositories/cycle-repository.interface.js';

export type GetCycleResult = { ok: true; cycle: Cycle } | { ok: false; error: string };

@injectable()
export class GetCycleUseCase {
  constructor(@inject('ICycleRepository') private readonly cycleRepo: ICycleRepository) {}

  async execute(cycleId: string): Promise<GetCycleResult> {
    const cycle = await this.cycleRepo.findById(cycleId);
    if (!cycle) {
      return { ok: false, error: `Cycle not found: "${cycleId}"` };
    }
    return { ok: true, cycle };
  }
}
