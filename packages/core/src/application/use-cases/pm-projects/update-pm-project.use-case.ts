import { injectable, inject } from 'tsyringe';
import type { PmProject } from '../../../domain/generated/output.js';
import type { IPmProjectRepository } from '../../ports/output/repositories/pm-project-repository.interface.js';

export interface UpdatePmProjectInput {
  name?: string;
  slug?: string;
  description?: string;
  estimateType?: string;
  startDate?: Date;
  endDate?: Date;
  featureToggles?: string;
}

export type UpdatePmProjectResult = { ok: true } | { ok: false; error: string };

@injectable()
export class UpdatePmProjectUseCase {
  constructor(@inject('IPmProjectRepository') private readonly projectRepo: IPmProjectRepository) {}

  async execute(projectId: string, input: UpdatePmProjectInput): Promise<UpdatePmProjectResult> {
    const project = await this.projectRepo.findById(projectId);
    if (!project) {
      return { ok: false, error: `Project not found: "${projectId}"` };
    }

    const fields: Partial<
      Pick<
        PmProject,
        | 'name'
        | 'slug'
        | 'description'
        | 'estimateType'
        | 'startDate'
        | 'endDate'
        | 'featureToggles'
      >
    > = {};

    if (input.name !== undefined) fields.name = input.name.trim();
    if (input.slug !== undefined) fields.slug = input.slug;
    if (input.description !== undefined) fields.description = input.description;
    if (input.estimateType !== undefined)
      fields.estimateType = input.estimateType as PmProject['estimateType'];
    if (input.startDate !== undefined) fields.startDate = input.startDate;
    if (input.endDate !== undefined) fields.endDate = input.endDate;
    if (input.featureToggles !== undefined) fields.featureToggles = input.featureToggles;

    await this.projectRepo.update(projectId, fields);
    return { ok: true };
  }
}
