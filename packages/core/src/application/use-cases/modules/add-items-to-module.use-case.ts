import { injectable, inject } from 'tsyringe';
import type { IPmModuleRepository } from '../../ports/output/repositories/pm-module-repository.interface.js';

export type AddItemsToModuleResult = { ok: true; added: number } | { ok: false; error: string };

@injectable()
export class AddItemsToModuleUseCase {
  constructor(@inject('IPmModuleRepository') private readonly moduleRepo: IPmModuleRepository) {}

  async execute(moduleId: string, workItemIds: string[]): Promise<AddItemsToModuleResult> {
    const mod = await this.moduleRepo.findById(moduleId);
    if (!mod) {
      return { ok: false, error: `Module not found: "${moduleId}"` };
    }

    let added = 0;
    for (const itemId of workItemIds) {
      await this.moduleRepo.addWorkItem(moduleId, itemId);
      added++;
    }

    return { ok: true, added };
  }
}
