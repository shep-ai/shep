import { injectable, inject } from 'tsyringe';
import { randomUUID } from 'node:crypto';
import type { PmProject } from '../../../domain/generated/output.js';
import type { IPmProjectRepository } from '../../ports/output/repositories/pm-project-repository.interface.js';
import type { IWorkItemStateRepository } from '../../ports/output/repositories/work-item-state-repository.interface.js';

export interface CreatePmProjectInput {
  name: string;
  description?: string;
  identifierPrefix: string;
  estimateType?: string;
  applicationId?: string;
}

export type CreatePmProjectResult = { ok: true; project: PmProject } | { ok: false; error: string };

@injectable()
export class CreatePmProjectUseCase {
  constructor(
    @inject('IPmProjectRepository') private readonly projectRepo: IPmProjectRepository,
    @inject('IWorkItemStateRepository') private readonly stateRepo: IWorkItemStateRepository
  ) {}

  async execute(input: CreatePmProjectInput): Promise<CreatePmProjectResult> {
    const trimmedName = input.name.trim();
    if (!trimmedName) {
      return { ok: false, error: 'Project name is required.' };
    }

    const prefix = input.identifierPrefix.trim().toUpperCase();
    if (!prefix || !/^[A-Z][A-Z0-9]{0,4}$/.test(prefix)) {
      return {
        ok: false,
        error:
          'Identifier prefix must be 1-5 uppercase alphanumeric characters starting with a letter.',
      };
    }

    const existing = await this.projectRepo.findByIdentifierPrefix(prefix);
    if (existing) {
      return { ok: false, error: `Identifier prefix "${prefix}" is already in use.` };
    }

    const slug = trimmedName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
    if (!slug) {
      return { ok: false, error: 'Project name must contain at least one letter or number.' };
    }

    const existingSlug = await this.projectRepo.findBySlug(slug);
    if (existingSlug) {
      return { ok: false, error: `A project with slug "${slug}" already exists.` };
    }

    const now = new Date();
    const project: PmProject = {
      id: randomUUID(),
      name: trimmedName,
      slug,
      description: input.description,
      identifierPrefix: prefix,
      workItemCounter: 0,
      estimateType: (input.estimateType as PmProject['estimateType']) ?? 'Category',
      applicationId: input.applicationId,
      createdAt: now,
      updatedAt: now,
    };

    await this.projectRepo.create(project);
    await this.stateRepo.seedDefaultStates(project.id);

    return { ok: true, project };
  }
}
