import { injectable, inject } from 'tsyringe';
import { randomUUID } from 'node:crypto';
import type { Cycle, CycleStatus } from '../../../domain/generated/output.js';
import type { ICycleRepository } from '../../ports/output/repositories/cycle-repository.interface.js';
import type { IPmProjectRepository } from '../../ports/output/repositories/pm-project-repository.interface.js';

export interface CreateCycleInput {
  projectId: string;
  name: string;
  description?: string;
  status?: CycleStatus;
  startDate?: Date;
  endDate?: Date;
}

export type CreateCycleResult = { ok: true; cycle: Cycle } | { ok: false; error: string };

@injectable()
export class CreateCycleUseCase {
  constructor(
    @inject('ICycleRepository') private readonly cycleRepo: ICycleRepository,
    @inject('IPmProjectRepository') private readonly projectRepo: IPmProjectRepository
  ) {}

  async execute(input: CreateCycleInput): Promise<CreateCycleResult> {
    const trimmedName = input.name.trim();
    if (!trimmedName) {
      return { ok: false, error: 'Cycle name is required.' };
    }

    const project = await this.projectRepo.findById(input.projectId);
    if (!project) {
      return { ok: false, error: `Project not found: "${input.projectId}"` };
    }

    const status = input.status ?? ('Upcoming' as CycleStatus);

    if (status === 'Active') {
      const existing = await this.cycleRepo.findActiveByProject(input.projectId);
      if (existing) {
        return {
          ok: false,
          error: `Project already has an active cycle: "${existing.name}". Only one cycle can be active at a time.`,
        };
      }
    }

    const now = new Date();
    const cycle: Cycle = {
      id: randomUUID(),
      projectId: input.projectId,
      name: trimmedName,
      description: input.description,
      status,
      startDate: input.startDate,
      endDate: input.endDate,
      createdAt: now,
      updatedAt: now,
    };

    await this.cycleRepo.create(cycle);
    return { ok: true, cycle };
  }
}
