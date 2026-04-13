import { injectable, inject } from 'tsyringe';
import type { ICycleRepository } from '../../ports/output/repositories/cycle-repository.interface.js';

export type AddItemsToCycleResult = { ok: true; added: number } | { ok: false; error: string };

@injectable()
export class AddItemsToCycleUseCase {
  constructor(@inject('ICycleRepository') private readonly cycleRepo: ICycleRepository) {}

  async execute(cycleId: string, workItemIds: string[]): Promise<AddItemsToCycleResult> {
    const cycle = await this.cycleRepo.findById(cycleId);
    if (!cycle) {
      return { ok: false, error: `Cycle not found: "${cycleId}"` };
    }

    let added = 0;
    for (const itemId of workItemIds) {
      await this.cycleRepo.addWorkItem(cycleId, itemId);
      added++;
    }

    return { ok: true, added };
  }
}
