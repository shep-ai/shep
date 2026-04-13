import { injectable, inject } from 'tsyringe';
import type { IPmModuleRepository } from '../../ports/output/repositories/pm-module-repository.interface.js';

export type RemoveItemsFromModuleResult =
  | { ok: true; removed: number }
  | { ok: false; error: string };

@injectable()
export class RemoveItemsFromModuleUseCase {
  constructor(@inject('IPmModuleRepository') private readonly moduleRepo: IPmModuleRepository) {}

  async execute(moduleId: string, workItemIds: string[]): Promise<RemoveItemsFromModuleResult> {
    const mod = await this.moduleRepo.findById(moduleId);
    if (!mod) {
      return { ok: false, error: `Module not found: "${moduleId}"` };
    }

    let removed = 0;
    for (const itemId of workItemIds) {
      await this.moduleRepo.removeWorkItem(moduleId, itemId);
      removed++;
    }

    return { ok: true, removed };
  }
}
