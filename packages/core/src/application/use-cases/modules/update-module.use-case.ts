import { injectable, inject } from 'tsyringe';
import type { PmModule, ModuleStatus } from '../../../domain/generated/output.js';
import type { IPmModuleRepository } from '../../ports/output/repositories/pm-module-repository.interface.js';

export interface UpdateModuleInput {
  name?: string;
  description?: string;
  status?: ModuleStatus;
  leadId?: string;
  startDate?: Date;
  endDate?: Date;
}

export type UpdateModuleResult = { ok: true; module: PmModule } | { ok: false; error: string };

@injectable()
export class UpdateModuleUseCase {
  constructor(@inject('IPmModuleRepository') private readonly moduleRepo: IPmModuleRepository) {}

  async execute(moduleId: string, input: UpdateModuleInput): Promise<UpdateModuleResult> {
    const mod = await this.moduleRepo.findById(moduleId);
    if (!mod) {
      return { ok: false, error: `Module not found: "${moduleId}"` };
    }

    if (input.name !== undefined) {
      const trimmed = input.name.trim();
      if (!trimmed) {
        return { ok: false, error: 'Module name cannot be empty.' };
      }
      input.name = trimmed;
    }

    await this.moduleRepo.update(moduleId, input);
    const updated = await this.moduleRepo.findById(moduleId);
    return { ok: true, module: updated! };
  }
}
