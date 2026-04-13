import { injectable, inject } from 'tsyringe';
import type { IntakeItem } from '../../../domain/generated/output.js';
import type { IIntakeItemRepository } from '../../ports/output/repositories/intake-item-repository.interface.js';

export interface ListIntakeItemsInput {
  projectId: string;
  status?: string;
}

export interface ListIntakeItemsResult {
  ok: true;
  items: IntakeItem[];
}

@injectable()
export class ListIntakeItemsUseCase {
  constructor(
    @inject('IIntakeItemRepository') private readonly intakeRepo: IIntakeItemRepository
  ) {}

  async execute(input: ListIntakeItemsInput): Promise<ListIntakeItemsResult> {
    const items = await this.intakeRepo.listByProject(input.projectId, input.status);
    return { ok: true, items };
  }
}
