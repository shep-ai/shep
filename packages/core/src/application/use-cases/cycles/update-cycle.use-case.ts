import { injectable, inject } from 'tsyringe';
import type { Cycle, CycleStatus } from '../../../domain/generated/output.js';
import type { ICycleRepository } from '../../ports/output/repositories/cycle-repository.interface.js';

export interface UpdateCycleInput {
  name?: string;
  description?: string;
  status?: CycleStatus;
  startDate?: Date;
  endDate?: Date;
}

export type UpdateCycleResult = { ok: true; cycle: Cycle } | { ok: false; error: string };

@injectable()
export class UpdateCycleUseCase {
  constructor(@inject('ICycleRepository') private readonly cycleRepo: ICycleRepository) {}

  async execute(cycleId: string, input: UpdateCycleInput): Promise<UpdateCycleResult> {
    const cycle = await this.cycleRepo.findById(cycleId);
    if (!cycle) {
      return { ok: false, error: `Cycle not found: "${cycleId}"` };
    }

    if (input.name !== undefined) {
      const trimmed = input.name.trim();
      if (!trimmed) {
        return { ok: false, error: 'Cycle name cannot be empty.' };
      }
      input.name = trimmed;
    }

    if (input.status === 'Active' && cycle.status !== 'Active') {
      const existing = await this.cycleRepo.findActiveByProject(cycle.projectId);
      if (existing && existing.id !== cycleId) {
        return {
          ok: false,
          error: `Project already has an active cycle: "${existing.name}". Only one cycle can be active at a time.`,
        };
      }
    }

    await this.cycleRepo.update(cycleId, input);
    const updated = await this.cycleRepo.findById(cycleId);
    return { ok: true, cycle: updated! };
  }
}
