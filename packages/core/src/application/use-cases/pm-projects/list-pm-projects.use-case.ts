import { injectable, inject } from 'tsyringe';
import type { PmProject } from '../../../domain/generated/output.js';
import type { IPmProjectRepository } from '../../ports/output/repositories/pm-project-repository.interface.js';

@injectable()
export class ListPmProjectsUseCase {
  constructor(@inject('IPmProjectRepository') private readonly projectRepo: IPmProjectRepository) {}

  async execute(): Promise<PmProject[]> {
    return this.projectRepo.list();
  }
}
