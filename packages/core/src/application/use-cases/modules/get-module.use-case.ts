import { injectable, inject } from 'tsyringe';
import type { PmModule } from '../../../domain/generated/output.js';
import type { IPmModuleRepository } from '../../ports/output/repositories/pm-module-repository.interface.js';
import type { IWorkItemRepository } from '../../ports/output/repositories/work-item-repository.interface.js';
import type { IWorkItemStateRepository } from '../../ports/output/repositories/work-item-state-repository.interface.js';

export interface ModuleWithProgress extends PmModule {
  totalItems: number;
  completedItems: number;
  progressPercent: number;
}

export type GetModuleResult =
  | { ok: true; module: ModuleWithProgress }
  | { ok: false; error: string };

@injectable()
export class GetModuleUseCase {
  constructor(
    @inject('IPmModuleRepository') private readonly moduleRepo: IPmModuleRepository,
    @inject('IWorkItemRepository') private readonly workItemRepo: IWorkItemRepository,
    @inject('IWorkItemStateRepository') private readonly stateRepo: IWorkItemStateRepository
  ) {}

  async execute(moduleId: string): Promise<GetModuleResult> {
    const mod = await this.moduleRepo.findById(moduleId);
    if (!mod) {
      return { ok: false, error: `Module not found: "${moduleId}"` };
    }

    const workItemIds = await this.moduleRepo.getWorkItemIds(moduleId);
    const states = await this.stateRepo.listByProject(mod.projectId);
    const completedStateIds = new Set(
      states.filter((s) => s.stateGroup === 'Completed').map((s) => s.id)
    );

    let completedItems = 0;
    for (const itemId of workItemIds) {
      const item = await this.workItemRepo.findById(itemId);
      if (item && completedStateIds.has(item.stateId)) {
        completedItems++;
      }
    }

    const totalItems = workItemIds.length;
    const progressPercent = totalItems > 0 ? Math.round((completedItems / totalItems) * 100) : 0;

    return {
      ok: true,
      module: { ...mod, totalItems, completedItems, progressPercent },
    };
  }
}
