import { injectable, inject } from 'tsyringe';
import { randomUUID } from 'node:crypto';
import type { Epic, EpicStatus } from '../../../domain/generated/output.js';
import type { IEpicRepository } from '../../ports/output/repositories/epic-repository.interface.js';
import type { IPmProjectRepository } from '../../ports/output/repositories/pm-project-repository.interface.js';

export type CreateEpicResult = { ok: true; epic: Epic } | { ok: false; error: string };

@injectable()
export class CreateEpicUseCase {
  constructor(
    @inject('IEpicRepository') private readonly epicRepo: IEpicRepository,
    @inject('IPmProjectRepository') private readonly projectRepo: IPmProjectRepository
  ) {}

  async execute(input: {
    projectId: string;
    name: string;
    description?: string;
    status?: EpicStatus;
    startDate?: Date;
    endDate?: Date;
  }): Promise<CreateEpicResult> {
    if (!input.name.trim()) return { ok: false, error: 'Epic name is required' };

    const project = await this.projectRepo.findById(input.projectId);
    if (!project) return { ok: false, error: 'Project not found' };

    const now = new Date();
    const epic: Epic = {
      id: randomUUID(),
      projectId: input.projectId,
      name: input.name.trim(),
      description: input.description,
      status: input.status ?? ('Backlog' as EpicStatus),
      startDate: input.startDate,
      endDate: input.endDate,
      createdAt: now,
      updatedAt: now,
      deletedAt: undefined,
    };

    await this.epicRepo.create(epic);
    return { ok: true, epic };
  }
}
