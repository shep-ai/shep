import { injectable, inject } from 'tsyringe';
import type { IPmModuleRepository } from '../../ports/output/repositories/pm-module-repository.interface.js';
import type { IWorkItemRepository } from '../../ports/output/repositories/work-item-repository.interface.js';
import type { IWorkItemStateRepository } from '../../ports/output/repositories/work-item-state-repository.interface.js';

export interface ModuleProgressItem {
  moduleId: string;
  moduleName: string;
  moduleStatus: string;
  totalItems: number;
  completedItems: number;
  progressPercent: number;
}

export type GetModuleProgressResult =
  | { ok: true; modules: ModuleProgressItem[] }
  | { ok: false; error: string };

@injectable()
export class GetModuleProgressUseCase {
  constructor(
    @inject('IPmModuleRepository') private readonly moduleRepo: IPmModuleRepository,
    @inject('IWorkItemRepository') private readonly workItemRepo: IWorkItemRepository,
    @inject('IWorkItemStateRepository') private readonly stateRepo: IWorkItemStateRepository
  ) {}

  async execute(projectId: string): Promise<GetModuleProgressResult> {
    const modules = await this.moduleRepo.listByProject(projectId);
    const states = await this.stateRepo.listByProject(projectId);
    const completedStateIds = new Set(
      states.filter((s) => s.stateGroup === 'Completed').map((s) => s.id)
    );

    const result: ModuleProgressItem[] = [];

    for (const mod of modules) {
      const workItemIds = await this.moduleRepo.getWorkItemIds(mod.id);
      let completedItems = 0;

      for (const itemId of workItemIds) {
        const item = await this.workItemRepo.findById(itemId);
        if (item && completedStateIds.has(item.stateId)) {
          completedItems++;
        }
      }

      const totalItems = workItemIds.length;
      const progressPercent = totalItems > 0 ? Math.round((completedItems / totalItems) * 100) : 0;

      result.push({
        moduleId: mod.id,
        moduleName: mod.name,
        moduleStatus: mod.status,
        totalItems,
        completedItems,
        progressPercent,
      });
    }

    return { ok: true, modules: result };
  }
}
