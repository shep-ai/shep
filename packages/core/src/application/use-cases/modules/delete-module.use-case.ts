import { injectable, inject } from 'tsyringe';
import type { IPmModuleRepository } from '../../ports/output/repositories/pm-module-repository.interface.js';

export type DeleteModuleResult = { ok: true } | { ok: false; error: string };

@injectable()
export class DeleteModuleUseCase {
  constructor(@inject('IPmModuleRepository') private readonly moduleRepo: IPmModuleRepository) {}

  async execute(moduleId: string): Promise<DeleteModuleResult> {
    const mod = await this.moduleRepo.findById(moduleId);
    if (!mod) {
      return { ok: false, error: `Module not found: "${moduleId}"` };
    }
    await this.moduleRepo.softDelete(moduleId);
    return { ok: true };
  }
}
