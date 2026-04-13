import { injectable, inject } from 'tsyringe';
import type { Cycle } from '../../../domain/generated/output.js';
import type { ICycleRepository } from '../../ports/output/repositories/cycle-repository.interface.js';

@injectable()
export class ListCyclesUseCase {
  constructor(@inject('ICycleRepository') private readonly cycleRepo: ICycleRepository) {}

  async execute(projectId: string): Promise<Cycle[]> {
    return this.cycleRepo.listByProject(projectId);
  }
}
