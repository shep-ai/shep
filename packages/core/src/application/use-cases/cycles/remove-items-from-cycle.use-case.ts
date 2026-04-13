import { injectable, inject } from 'tsyringe';
import type { ICycleRepository } from '../../ports/output/repositories/cycle-repository.interface.js';

export type RemoveItemsFromCycleResult =
  | { ok: true; removed: number }
  | { ok: false; error: string };

@injectable()
export class RemoveItemsFromCycleUseCase {
  constructor(@inject('ICycleRepository') private readonly cycleRepo: ICycleRepository) {}

  async execute(cycleId: string, workItemIds: string[]): Promise<RemoveItemsFromCycleResult> {
    const cycle = await this.cycleRepo.findById(cycleId);
    if (!cycle) {
      return { ok: false, error: `Cycle not found: "${cycleId}"` };
    }

    let removed = 0;
    for (const itemId of workItemIds) {
      await this.cycleRepo.removeWorkItem(cycleId, itemId);
      removed++;
    }

    return { ok: true, removed };
  }
}
