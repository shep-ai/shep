import { injectable, inject } from 'tsyringe';
import type { PmProject } from '../../../domain/generated/output.js';
import type { IPmProjectRepository } from '../../ports/output/repositories/pm-project-repository.interface.js';

export type GetPmProjectResult = { ok: true; project: PmProject } | { ok: false; error: string };

@injectable()
export class GetPmProjectUseCase {
  constructor(@inject('IPmProjectRepository') private readonly projectRepo: IPmProjectRepository) {}

  async execute(projectIdOrSlug: string): Promise<GetPmProjectResult> {
    const project =
      (await this.projectRepo.findById(projectIdOrSlug)) ??
      (await this.projectRepo.findBySlug(projectIdOrSlug));

    if (!project) {
      return { ok: false, error: `Project not found: "${projectIdOrSlug}"` };
    }
    return { ok: true, project };
  }
}
