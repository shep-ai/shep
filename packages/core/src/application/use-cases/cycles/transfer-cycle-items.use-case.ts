import { injectable, inject } from 'tsyringe';
import type { ICycleRepository } from '../../ports/output/repositories/cycle-repository.interface.js';
import type { IWorkItemRepository } from '../../ports/output/repositories/work-item-repository.interface.js';
import type { IWorkItemStateRepository } from '../../ports/output/repositories/work-item-state-repository.interface.js';

export interface TransferCycleItemsInput {
  sourceCycleId: string;
  targetCycleId?: string;
}

export type TransferCycleItemsResult =
  | { ok: true; transferred: number; kept: number }
  | { ok: false; error: string };

@injectable()
export class TransferCycleItemsUseCase {
  constructor(
    @inject('ICycleRepository') private readonly cycleRepo: ICycleRepository,
    @inject('IWorkItemRepository') private readonly workItemRepo: IWorkItemRepository,
    @inject('IWorkItemStateRepository') private readonly stateRepo: IWorkItemStateRepository
  ) {}

  async execute(input: TransferCycleItemsInput): Promise<TransferCycleItemsResult> {
    const sourceCycle = await this.cycleRepo.findById(input.sourceCycleId);
    if (!sourceCycle) {
      return { ok: false, error: `Source cycle not found: "${input.sourceCycleId}"` };
    }

    if (input.targetCycleId) {
      const targetCycle = await this.cycleRepo.findById(input.targetCycleId);
      if (!targetCycle) {
        return { ok: false, error: `Target cycle not found: "${input.targetCycleId}"` };
      }
      if (targetCycle.projectId !== sourceCycle.projectId) {
        return { ok: false, error: 'Source and target cycles must belong to the same project.' };
      }
    }

    const workItemIds = await this.cycleRepo.getWorkItemIds(input.sourceCycleId);
    const states = await this.stateRepo.listByProject(sourceCycle.projectId);
    const completedStateIds = new Set(
      states
        .filter((s) => s.stateGroup === 'Completed' || s.stateGroup === 'Cancelled')
        .map((s) => s.id)
    );

    let transferred = 0;
    let kept = 0;

    for (const itemId of workItemIds) {
      const workItem = await this.workItemRepo.findById(itemId);
      if (!workItem) continue;

      if (completedStateIds.has(workItem.stateId)) {
        kept++;
        continue;
      }

      await this.cycleRepo.removeWorkItem(input.sourceCycleId, itemId);
      if (input.targetCycleId) {
        await this.cycleRepo.addWorkItem(input.targetCycleId, itemId);
      }
      transferred++;
    }

    return { ok: true, transferred, kept };
  }
}
