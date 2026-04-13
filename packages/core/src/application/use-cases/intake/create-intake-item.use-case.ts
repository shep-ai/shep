import { injectable, inject } from 'tsyringe';
import { randomUUID } from 'node:crypto';
import type { IntakeItem, IntakeStatus } from '../../../domain/generated/output.js';
import type { IIntakeItemRepository } from '../../ports/output/repositories/intake-item-repository.interface.js';
import type { IPmProjectRepository } from '../../ports/output/repositories/pm-project-repository.interface.js';

export interface CreateIntakeItemInput {
  projectId: string;
  title: string;
  source: string;
  description?: string;
}

export type CreateIntakeItemResult =
  | { ok: true; intakeItem: IntakeItem }
  | { ok: false; error: string };

@injectable()
export class CreateIntakeItemUseCase {
  constructor(
    @inject('IIntakeItemRepository') private readonly intakeRepo: IIntakeItemRepository,
    @inject('IPmProjectRepository') private readonly projectRepo: IPmProjectRepository
  ) {}

  async execute(input: CreateIntakeItemInput): Promise<CreateIntakeItemResult> {
    const trimmedTitle = input.title.trim();
    if (!trimmedTitle) {
      return { ok: false, error: 'Intake item title is required.' };
    }

    const project = await this.projectRepo.findById(input.projectId);
    if (!project) {
      return { ok: false, error: `Project not found: "${input.projectId}"` };
    }

    const now = new Date();
    const intakeItem: IntakeItem = {
      id: randomUUID(),
      projectId: input.projectId,
      title: trimmedTitle,
      description: input.description,
      source: input.source,
      status: 'Pending' as IntakeStatus,
      createdAt: now,
      updatedAt: now,
    };

    await this.intakeRepo.create(intakeItem);
    return { ok: true, intakeItem };
  }
}
