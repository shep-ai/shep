import { injectable, inject } from 'tsyringe';
import { randomUUID } from 'node:crypto';
import type { PmModule, ModuleStatus } from '../../../domain/generated/output.js';
import type { IPmModuleRepository } from '../../ports/output/repositories/pm-module-repository.interface.js';
import type { IPmProjectRepository } from '../../ports/output/repositories/pm-project-repository.interface.js';

export interface CreateModuleInput {
  projectId: string;
  name: string;
  description?: string;
  status?: ModuleStatus;
  leadId?: string;
  startDate?: Date;
  endDate?: Date;
}

export type CreateModuleResult = { ok: true; module: PmModule } | { ok: false; error: string };

@injectable()
export class CreateModuleUseCase {
  constructor(
    @inject('IPmModuleRepository') private readonly moduleRepo: IPmModuleRepository,
    @inject('IPmProjectRepository') private readonly projectRepo: IPmProjectRepository
  ) {}

  async execute(input: CreateModuleInput): Promise<CreateModuleResult> {
    const trimmedName = input.name.trim();
    if (!trimmedName) {
      return { ok: false, error: 'Module name is required.' };
    }

    const project = await this.projectRepo.findById(input.projectId);
    if (!project) {
      return { ok: false, error: `Project not found: "${input.projectId}"` };
    }

    const now = new Date();
    const mod: PmModule = {
      id: randomUUID(),
      projectId: input.projectId,
      name: trimmedName,
      description: input.description,
      status: input.status ?? ('Backlog' as ModuleStatus),
      leadId: input.leadId,
      startDate: input.startDate,
      endDate: input.endDate,
      createdAt: now,
      updatedAt: now,
    };

    await this.moduleRepo.create(mod);
    return { ok: true, module: mod };
  }
}
