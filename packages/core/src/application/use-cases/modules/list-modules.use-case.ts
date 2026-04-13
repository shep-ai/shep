import { injectable, inject } from 'tsyringe';
import type { PmModule } from '../../../domain/generated/output.js';
import type { IPmModuleRepository } from '../../ports/output/repositories/pm-module-repository.interface.js';

@injectable()
export class ListModulesUseCase {
  constructor(@inject('IPmModuleRepository') private readonly moduleRepo: IPmModuleRepository) {}

  async execute(projectId: string): Promise<PmModule[]> {
    return this.moduleRepo.listByProject(projectId);
  }
}
