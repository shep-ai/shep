import { injectable, inject } from 'tsyringe';
import type { IPmProjectRepository } from '../../ports/output/repositories/pm-project-repository.interface.js';

export type DeletePmProjectResult = { ok: true } | { ok: false; error: string };

@injectable()
export class DeletePmProjectUseCase {
  constructor(@inject('IPmProjectRepository') private readonly projectRepo: IPmProjectRepository) {}

  async execute(projectId: string): Promise<DeletePmProjectResult> {
    const project = await this.projectRepo.findById(projectId);
    if (!project) {
      return { ok: false, error: `Project not found: "${projectId}"` };
    }

    await this.projectRepo.softDelete(projectId);
    return { ok: true };
  }
}
